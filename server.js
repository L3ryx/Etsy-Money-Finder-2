import "dotenv/config";
import express from "express";
import multer from "multer";
import axios from "axios";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ================= SOCKET =================
io.on("connection", (socket) => {
  console.log("🟢 Client connected");
  socket.emit("connected", { socketId: socket.id });
});

// ================= ETSY SEARCH =================
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;

    const scraperResponse = await axios.get("https://api.scraperapi.com/", {
      params: {
        api_key: process.env.SCRAPAPI_KEY,
        url: etsyUrl,
        render: true
      }
    });

    const html = scraperResponse.data;

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

// ================= REVERSE IMAGE → ALIEXPRESS =================
app.post("/reverse-image-aliexpress", async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });

  try {
    const response = await axios.get("https://google.serper.dev/images", {
      params: { url: imageUrl, filter: "aliexpress" },
      headers: { "X-API-KEY": process.env.SERPER_API_KEY }
    });

    const items = response.data.items?.slice(0, 5).map(item => ({
      link: item.link,
      image: item.thumbnail
    })) || [];

    res.json({ results: items });
  } catch (err) {
    console.error("Serper Error:", err.message);
    res.status(500).json({ error: "Reverse image search failed" });
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
