// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ================= SOCKET LOG SYSTEM =================
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", { message, time: new Date().toISOString() });
  }
}

// ================= SEARCH ETSY + REVERSE IMAGE =================
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);

  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    sendLog(socket, `Searching Etsy for: ${keyword}`);

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

    const images = [...(html.match(imageRegex) || [])].slice(0, maxItems);
    const links = [...(html.match(linkRegex) || [])].slice(0, maxItems);

    const results = [];

    for (let i = 0; i < images.length; i++) {
      const etsyImage = images[i];
      const etsyLink = links[i] || etsyUrl;

      sendLog(socket, `Reverse searching for image ${i + 1}`);

      let aliexpressResults = [];

      try {
        const reverseSearchRes = await axios.get("https://api.scraperapi.com/", {
          params: {
            api_key: process.env.SCRAPAPI_KEY,
            url: `https://www.google.com/searchbyimage?&image_url=${encodeURIComponent(etsyImage)}`,
            render: true
          }
        });

        const htmlRS = reverseSearchRes.data;

        const aliexpressRegex = /https:\/\/www\.aliexpress\.com\/item\/\d+/g;
        const imgRegex = /<img[^>]+src="(https:\/\/[^">]+)"/g;

        const alilinks = [...htmlRS.matchAll(aliexpressRegex)].map(m => m[0]).slice(0, 5);
        const aliimages = [...htmlRS.matchAll(imgRegex)].map(m => m[1]).slice(0, 5);

        aliexpressResults = alilinks.map((link, idx) => ({
          link,
          image: aliimages[idx] || link
        }));
      } catch (err) {
        sendLog(socket, `Reverse image search failed for image ${i + 1}`);
      }

      results.push({ etsyImage, etsyLink, aliexpress: aliexpressResults });
    }

    res.json({ results });
  } catch (err) {
    console.error("Search Error:", err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// ================= SOCKET CONNECTION =================
io.on("connection", (socket) => {
  console.log("🟢 Client connected");
  socket.emit("connected", { socketId: socket.id });
});

// ================= SERVER START =================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
