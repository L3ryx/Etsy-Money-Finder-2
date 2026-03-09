// server.js
require("dotenv").config();
import express from "express";
import multer from "multer";
import axios from "axios";
import http from "http";
import { Server } from "socket.io";
import FormData from "form-data";
import fetch from "node-fetch";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ==========================
// LOG SYSTEM
// ==========================
function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) {
    socket.emit("log", { message, type, time: new Date().toISOString() });
  }
}

// ==========================
// ETSY SEARCH
// ==========================
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);
  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperResponse = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true }
    });
    const html = scraperResponse.data;

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

// ==========================
// CALCULATE SIMILARITY
// ==========================
async function calculateSimilarity(base64A, base64B) {
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
}

// ==========================
// FIND ALIEXPRESS
// ==========================
app.post("/find-aliexpress", async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);

  sendLog(socket, "🔎 Searching AliExpress matches");

  try {
    const response = await axios.get("https://google.serper.dev/images", {
      params: {
        engine: "google_reverse_image",
        image_url: etsyImage,
        "X-API-KEY": process.env.SERPER_API_KEY
      }
    });

    const serperResults = response.data?.image_results || [];
    const aliexpressResults = serperResults.filter(r => r.link?.includes("aliexpress.com")).slice(0, 5);

    const matches = [];
    for (const item of aliexpressResults) {
      try {
        // Récupérer l'image AliExpress en base64
        const imgRes = await axios.get(item.thumbnail, { responseType: "arraybuffer" });
        const base64Ali = Buffer.from(imgRes.data, "binary").toString("base64");

        // Calculer la similarité
        const similarity = await calculateSimilarity(etsyImage, base64Ali);

        if (similarity >= 0.7) {
          matches.push({
            aliImage: item.thumbnail,
            aliLink: item.link,
            similarity
          });
        }
      } catch (err) {
        console.log("Error processing AliExpress image", err.message);
      }
    }

    res.json({ matches });
    sendLog(socket, `✅ Found ${matches.length} AliExpress matches`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ matches: [] });
    sendLog(socket, "❌ Error finding AliExpress matches", "error");
  }
});

// ==========================
// SOCKET
// ==========================
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

// ==========================
// START SERVER
// ==========================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
