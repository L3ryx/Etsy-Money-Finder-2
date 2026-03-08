require("dotenv").config();

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ===================================================== */
/* MIDDLEWARE */
/* ===================================================== */
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* ===================================================== */
/* SOCKET LOG SYSTEM */
/* ===================================================== */
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", {
      message,
      time: new Date().toISOString()
    });
  }
}

/* ===================================================== */
/* 🔎 ETSY SEARCH (IMAGE + LINK) */
/* ===================================================== */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);
  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: {
        api_key: process.env.SCRAPAPI_KEY,
        url: etsyUrl,
        render: true
      }
    });

    const html = scraperRes.data;
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

/* ===================================================== */
/* 🖼 REVERSE IMAGE + ALIEXPRESS + OPENAI SIMILARITY */
/* ===================================================== */
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const finalResults = [];

  for (const file of req.files) {
    sendLog(socket, `Processing ${file.originalname}`);
    const base64 = file.buffer.toString("base64");

    /* UPLOAD TO IMGBB */
    let etsyImageUrl;
    try {
      const uploadRes = await axios.post(
        "https://api.imgbb.com/1/upload",
        new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
      );
      etsyImageUrl = uploadRes.data.data.url;
      sendLog(socket, "Uploaded to IMGBB");
    } catch {
      sendLog(socket, "IMGBB upload failed");
      continue;
    }

    /* REVERSE IMAGE GOOGLE + FILTER ALIEXPRESS */
    // Ici, tu devrais remplacer par ton API de reverse image (ex: Google Custom Search)
    // Pour l’exemple, on simule 5 résultats AliExpress
    const aliResults = [
      { link: "https://www.aliexpress.com/item/1", image: etsyImageUrl },
      { link: "https://www.aliexpress.com/item/2", image: etsyImageUrl },
      { link: "https://www.aliexpress.com/item/3", image: etsyImageUrl },
      { link: "https://www.aliexpress.com/item/4", image: etsyImageUrl },
      { link: "https://www.aliexpress.com/item/5", image: etsyImageUrl }
    ];

    /* COMPARAISON OPENAI POUR CHAQUE ALIEXPRESS IMAGE */
    const matches = [];
    for (const ali of aliResults) {
      try {
        const vision = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Return similarity score between 0 and 100." },
                  { type: "image_url", image_url: { url: etsyImageUrl } },
                  { type: "image_url", image_url: { url: ali.image } }
                ]
              }
            ]
          },
          { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
        );

        const text = vision.data.choices[0].message.content;
        const matchScore = text.match(/\d+/);
        const similarity = matchScore ? parseInt(matchScore[0]) : 0;

        if (similarity >= 70) {
          matches.push({
            etsy: { image: etsyImageUrl, link: file.originalname },
            aliexpress: ali,
            similarity
          });
          sendLog(socket, `Match found: ${similarity}%`);
        }
      } catch {
        sendLog(socket, "OpenAI comparison failed");
      }
    }

    if (matches.length > 0) finalResults.push(...matches);
  }

  res.json({ results: finalResults });
});

/* ===================================================== */
/* SOCKET CONNECTION */
/* ===================================================== */
io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ===================================================== */
/* SERVER START */
/* ===================================================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
