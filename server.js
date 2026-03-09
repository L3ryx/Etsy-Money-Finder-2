// =====================================================
// SERVER.JS – Etsy → AliExpress Finder
// =====================================================

import "dotenv/config";
import express from "express";
import multer from "multer";
import axios from "axios";
import http from "http";
import { Server } from "socket.io";
import fetch from "node-fetch";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* =====================================================
MIDDLEWARE
===================================================== */
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* =====================================================
SOCKET LOG SYSTEM
===================================================== */
function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) {
    socket.emit("log", { message, type, time: new Date().toISOString() });
  }
}

/* =====================================================
SIMILARITY FUNCTION (OpenAI GPT-4o-mini)
===================================================== */
async function calculateSimilarity(base64A, base64B) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Return only similarity 0 to 1." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64A}` } },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64B}` } }
            ]
          }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    const text = response.data.choices[0].message.content;
    const match = text.match(/0\.\d+|1(\.0+)?/);
    return match ? parseFloat(match[0]) : 0;
  } catch (err) {
    console.error("Similarity error:", err.message);
    return 0;
  }
}

/* =====================================================
ETSY SEARCH ROUTE
===================================================== */
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
    console.error("ScraperAPI error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* =====================================================
FIND ALIEXPRESS ROUTE
===================================================== */
app.post("/find-aliexpress", async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);

  sendLog(socket, "🔎 Searching AliExpress matches...");

  try {
    // 1️⃣ Get top 5 AliExpress image results via Serper
    const serperRes = await axios.get("https://google.serper.dev/images", {
      params: {
        engine: "google_reverse_image",
        image_url: etsyImage,
        "X-API-KEY": process.env.SERPER_API_KEY
      }
    });

    const aliResults = (serperRes.data?.image_results || []).slice(0, 5);

    const matches = [];
    // 2️⃣ Compare Etsy image with each AliExpress image
    for (const r of aliResults) {
      const response = await fetch(r.thumbnail); // download AliExpress thumbnail
      const buffer = await response.arrayBuffer();
      const aliBase64 = Buffer.from(buffer).toString("base64");

      const similarity = await calculateSimilarity(
        Buffer.from(await fetch(etsyImage).then(res => res.arrayBuffer())).toString("base64"),
        aliBase64
      );

      if (similarity >= 0.7) {
        matches.push({
          aliImage: r.thumbnail,
          aliLink: r.link,
          similarity
        });
      }
    }

    res.json({ matches });
  } catch (err) {
    console.error("Find AliExpress error:", err.message);
    sendLog(socket, `Error finding AliExpress matches`, "error");
    res.status(500).json({ matches: [] });
  }
});

/* =====================================================
SOCKET.IO CONNECTION
===================================================== */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected:", socket.id);
});

/* =====================================================
START SERVER
===================================================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
