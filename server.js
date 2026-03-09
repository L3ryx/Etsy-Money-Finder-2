require("dotenv").config();

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const upload = multer({ storage: multer.memoryStorage() });

/* ====================== SOCKET LOG ====================== */
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", { message, time: new Date().toISOString() });
  }
}

/* ====================== ETSY SEARCH ====================== */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  const maxItems = Math.min(parseInt(limit) || 10, 50);

  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;

    const scraperRes = await axios.get("https://api.scraperapi.com", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true },
    });

    const html = scraperRes.data;

    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;

    const images = [...html.matchAll(imageRegex)].map((m) => m[0]);
    const links = [...html.matchAll(linkRegex)].map((m) => m[0]);

    const results = [];
    for (let i = 0; i < Math.min(maxItems, images.length); i++) {
      results.push({ image: images[i], link: links[i] || etsyUrl });
    }

    res.json({ results });
  } catch (err) {
    console.error("ScraperAPI Etsy Error:", err.message);
    res.status(500).json({ error: "Scraping Etsy failed" });
  }
});

/* ====================== IMAGE ANALYSIS ====================== */
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `Processing ${file.originalname}`);
    const base64 = file.buffer.toString("base64");

    /* ===== UPLOAD IMAGE TO IMGBB ===== */
    let imageUrl;
    try {
      const uploadRes = await axios.post(
        "https://api.imgbb.com/1/upload",
        new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
      );
      imageUrl = uploadRes.data.data.url;
      sendLog(socket, "Uploaded to IMGBB");
    } catch (err) {
      sendLog(socket, "IMGBB upload failed");
      continue;
    }

    /* ===== REVERSE IMAGE + FILTER ALIEXPRESS ===== */
    let aliexpressResults = [];
    try {
      const reverseUrl = `https://api.scraperapi.com?api_key=${process.env.SCRAPAPI_KEY}&url=${encodeURIComponent(
        `https://www.google.com/searchbyimage?image_url=${imageUrl}&tbm=isch`
      )}&render=true`;

      const reverseRes = await axios.get(reverseUrl);
      const html = reverseRes.data;

      const imgRegex = /https:\/\/[^"]+\.jpg/g;
      const linkRegex = /https:\/\/www\.aliexpress\.com\/item\/\d+/g;

      const images = [...html.matchAll(imgRegex)].map((m) => m[0]).slice(0, 5);
      const links = [...html.matchAll(linkRegex)].map((m) => m[0]).slice(0, 5);

      aliexpressResults = images.map((img, i) => ({ image: img, link: links[i] || "#" }));
      sendLog(socket, "Reverse image + AliExpress top 5 done");
    } catch (err) {
      sendLog(socket, "Reverse image + AliExpress failed");
    }

    /* ===== OPENAI SIMILARITY ===== */
    const matches = [];
    for (const item of aliexpressResults) {
      try {
        const vision = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Return similarity score 0-100 between two images." },
                  { type: "image_url", image_url: { url: imageUrl } },
                  { type: "image_url", image_url: { url: item.image } },
                ],
              },
            ],
          },
          { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
        );

        const text = vision.data.choices[0].message.content;
        const matchScore = parseInt((text.match(/\d+/) || [0])[0]);

        matches.push({ ...item, similarity: matchScore });
        sendLog(socket, `Similarity ${matchScore}% with ${item.link}`);

        if (matchScore >= 70) {
          sendLog(socket, "Match ≥70%, stopping comparison for this image");
          break; // stop further comparison
        }
      } catch (err) {
        sendLog(socket, "OpenAI similarity failed for " + item.link);
      }
    }

    results.push({ image: file.originalname, matches });
  }

  res.json({ results });
});

/* ====================== SOCKET CONNECTION ====================== */
io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ====================== START SERVER ====================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
