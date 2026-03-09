require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* =====================================================
LOG SYSTEM
==================================================== */
function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) socket.emit("log", { message, type, time: new Date().toISOString() });
}

/* =====================================================
🔎 ETSY SEARCH
==================================================== */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);

  if (!keyword) return res.status(400).json({ error: "Keyword required" });
  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;

    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true }
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

    sendLog(socket, `🔍 Found ${results.length} Etsy items`);
    res.json({ results });

  } catch (err) {
    sendLog(socket, "❌ Etsy scraping failed", "error");
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* =====================================================
🧠 ANALYZE ETSY → ALIEXPRESS
==================================================== */
app.post("/analyze-etsy", async (req, res) => {
  const { etsyResults, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  if (!etsyResults || !Array.isArray(etsyResults))
    return res.status(400).json({ error: "etsyResults missing" });

  for (const item of etsyResults) {
    try {
      sendLog(socket, `🔎 Processing Etsy image`, "info");

      // Convert Etsy image to base64
      const imgRes = await axios.get(item.image, { responseType: "arraybuffer" });
      const base64 = Buffer.from(imgRes.data, "binary").toString("base64");

      // Call OpenAI to find top AliExpress match
      const openAIRes = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Return top AliExpress image URL + similarity 0-100" },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
              ]
            }
          ]
        },
        { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
      );

      const text = openAIRes.data.choices[0].message.content;
      const match = text.match(/(\d+)%?\s*(https?:\/\/\S+)/);
      const similarity = match ? parseInt(match[1]) : 0;
      const aliLink = match ? match[2] : "#";

      if (similarity >= 40) {
        results.push({
          etsyImage: item.image,
          etsyLink: item.link,
          aliLink,
          similarity
        });
        sendLog(socket, `✅ Match found: ${similarity}% | ${aliLink}`);
      } else {
        sendLog(socket, "❌ No match ≥ 40%");
      }

    } catch (err) {
      sendLog(socket, "OpenAI Vision error", "error");
    }
  }

  if (results.length === 0) sendLog(socket, "No results with similarity ≥ 40%");
  res.json({ results });
});

/* =====================================================
SOCKET CONNECTION
==================================================== */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  sendLog(socket, "🟢 Client connected");
});

/* =====================================================
SERVER START
==================================================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
