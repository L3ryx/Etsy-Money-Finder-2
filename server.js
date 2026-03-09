// server.js

// =====================================================
// IMPORTS
// =====================================================
import "dotenv/config";  // équivalent de require('dotenv').config()
import express from "express";
import multer from "multer";
import axios from "axios";
import http from "http";
import { Server } from "socket.io";

// =====================================================
// APP & SOCKET
// =====================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// =====================================================
// LOG FUNCTION
// =====================================================
function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) {
    socket.emit("log", { message, type, time: new Date().toISOString() });
  }
}

// =====================================================
// ETSY SEARCH ROUTE
// =====================================================
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
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
      results.push({ etsyImage: images[i], etsyLink: links[i] || etsyUrl });
    }

    res.json({ results });
  } catch (err) {
    console.error("ScraperAPI Error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

// =====================================================
// FIND ALIEXPRESS WITH OPENAI SIMILARITY
// =====================================================
app.post("/find-aliexpress", async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);

  try {
    sendLog(socket, "🔎 Searching AliExpress images...");

    // Ici tu dois mettre la logique pour récupérer les images AliExpress (ex: Serper API)
    const aliexpressImages = []; // [{ url, imageUrl }]

    const results = [];

    for (const ali of aliexpressImages.slice(0, 5)) { // 5 premières images
      try {
        const vision = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "Return similarity score between 0 and 100." },
                { type: "image_url", image_url: { url: etsyImage } },
                { type: "image_url", image_url: { url: ali.imageUrl } }
              ]
            }]
          },
          { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
        );

        const text = vision.data.choices[0].message.content;
        const match = text.match(/\d+/);
        const similarity = match ? parseInt(match[0]) : 0;

        if (similarity >= 70) { // filtre ≥70%
          results.push({ aliImage: ali.imageUrl, aliLink: ali.url, similarity });
        }

      } catch (err) {
        sendLog(socket, "OpenAI Vision failed for an image", "error");
      }
    }

    res.json({ matches: results });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error finding AliExpress matches" });
  }
});

// =====================================================
// SOCKET CONNECTION
// =====================================================
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

// =====================================================
// START SERVER
// =====================================================
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
