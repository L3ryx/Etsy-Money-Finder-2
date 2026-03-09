require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* ================= SOCKET LOG ================= */
function sendLog(socket, message) {
  console.log(message);
  if (socket) socket.emit("log", { message, time: new Date().toISOString() });
}

/* ================= ETSY SEARCH ================= */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });
  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const response = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true }
    });
    const html = response.data;

    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;
    const images = [...html.matchAll(imageRegex)].map(m => m[0]);
    const links = [...html.matchAll(linkRegex)].map(m => m[0]);

    const results = [];
    for (let i = 0; i < Math.min(maxItems, images.length); i++) {
      results.push({ image: images[i], link: links[i] || etsyUrl });
    }

    res.json({ results });
  } catch (err) {
    console.error("ScraperAPI Error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* ================= OPENAI SIMILARITY ================= */
async function calculateSimilarity(imgA, imgB) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Return similarity score between 0 and 100." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgA}` } },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgB}` } }
            ]
          }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
    );
    const text = response.data.choices[0].message.content;
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  } catch (err) {
    console.error("OpenAI error:", err.message);
    return 0;
  }
}

/* ================= IMAGE ANALYSIS ================= */
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `Processing ${file.originalname}`);
    const base64 = file.buffer.toString("base64");
    let imageUrl;

    // Upload to IMGBB
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

    // Search reverse image via Serper
    let serperResults = [];
    try {
      const response = await axios.post(
        "https://google.serper.dev/images",
        { imageUrl },
        { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
      );
      serperResults = response.data.images || [];
      sendLog(socket, `${serperResults.length} results found`);
    } catch (err) {
      sendLog(socket, "Serper failed");
    }

    const topResults = serperResults.slice(0, 5);
    const matches = [];

    for (const item of topResults) {
      if (!item.link?.includes("aliexpress.com")) continue;
      let similarity = 0;
      try {
        const imgRes = await axios.get(item.thumbnail, { responseType: "arraybuffer" });
        const base64B = Buffer.from(imgRes.data, "binary").toString("base64");
        similarity = await calculateSimilarity(base64, base64B);
      } catch (err) {
        sendLog(socket, "Similarity check failed");
      }
      matches.push({ url: item.link, similarity, image: item.thumbnail });
      if (similarity >= 60) break;
    }

    results.push({ image: imageUrl, matches });
  }

  res.json({ results });
});

/* ================= SOCKET.IO ================= */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
