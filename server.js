import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import axios from "axios";
import http from "http";
import { Server } from "socket.io";

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
  if (socket) {
    socket.emit("log", { message, type, time: new Date().toISOString() });
  }
}

/* =====================================================
ETSY SEARCH
==================================================== */
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
      results.push({ image: images[i], link: links[i] || etsyUrl });
    }

    res.json({ results });
  } catch (err) {
    console.error("ScraperAPI Error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* =====================================================
ANALYZE IMAGES + SEARCH ALIEXPRESS + SIMILARITY
==================================================== */
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `Processing ${file.originalname}`);
    const base64 = file.buffer.toString("base64");

    // Upload to IMGBB
    let etsyImageUrl;
    try {
      const uploadRes = await axios.post(
        "https://api.imgbb.com/1/upload",
        new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
      );
      etsyImageUrl = uploadRes.data.data.url;
      sendLog(socket, "Uploaded to IMGBB");
    } catch {
      sendLog(socket, "IMGBB upload failed", "error");
      continue;
    }

    // Call Serper for AliExpress search
    sendLog(socket, "🔎 Searching AliExpress via Serper");
    let serperResults = [];
    try {
      const response = await axios.get("https://google.serper.dev/images", {
        params: { engine: "google_reverse_image", image_url: etsyImageUrl },
        headers: { "X-API-KEY": process.env.SERPER_API_KEY }
      });
      serperResults = response.data?.image_results || [];
      sendLog(socket, `📦 ${serperResults.length} results found`);
    } catch (err) {
      sendLog(socket, `❌ Serper error | ${err.response?.status}`, "error");
      serperResults = [];
    }

    // Filter AliExpress links
    const aliexpressLinks = serperResults
      .filter(r => r.link?.includes("aliexpress.com"))
      .slice(0, 10);

    const matches = [];
    for (const item of aliexpressLinks) {
      matches.push({ url: item.link, similarity: 70 }); // Placeholder
    }

    results.push({ etsyImage: etsyImageUrl, etsyName: file.originalname, matches });
  }

  res.json({ results });
});

/* =====================================================
SOCKET.IO
==================================================== */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* =====================================================
START SERVER
==================================================== */
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
