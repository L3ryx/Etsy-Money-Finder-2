// =====================================================
// SERVER.JS
// =====================================================

import "dotenv/config";
import express from "express";
import multer from "multer";
import axios from "axios";
import http from "http";
import { Server } from "socket.io";

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
    socket.emit("log", { message, time: new Date().toISOString() });
  }
}

/* ===================================================== */
/* SEARCH ETSY (GET IMAGE FOR REVERSE SEARCH) */
/* ===================================================== */

app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 5, 50);
  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;

    const scraperResponse = await axios.get("https://api.scraperapi.com/", {
      params: {
        api_key: process.env.SCRAPAPI_KEY,
        url: etsyUrl,
        render: true,
      },
    });

    const html = scraperResponse.data;

    // Extract first image and listing links
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
    console.error("ScraperAPI Error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* ===================================================== */
/* REVERSE IMAGE SEARCH GOOGLE VIA SERPER + FILTER ALIEXPRESS */
/* ===================================================== */

app.post("/reverse-image", async (req, res) => {
  const { imageUrl, limit } = req.body;
  if (!imageUrl) return res.status(400).json({ error: "Image URL required" });

  const maxItems = Math.min(parseInt(limit) || 5, 5);

  try {
    const response = await axios.post(
      "https://google.serper.dev/images",
      {
        q: "site:aliexpress.com", // filter AliExpress
        image_url: imageUrl,
        num: maxItems,
      },
      {
        headers: { "X-API-KEY": process.env.X-API-KEY },
      }
    );

    const results = (response.data?.images || []).slice(0, maxItems).map((item) => ({
      image: item.thumbnail || item.link,
      link: item.link,
    }));

    res.json({ results });
  } catch (err) {
    console.error("Serper Error:", err.message);
    res.status(500).json({ error: "Reverse image search failed" });
  }
});

/* ===================================================== */
/* SOCKET CONNECTION */
/* ===================================================== */

io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);
});

/* ===================================================== */
/* START SERVER */
/* ===================================================== */

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
