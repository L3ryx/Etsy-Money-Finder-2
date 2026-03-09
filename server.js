require("dotenv").config();
const express = require("express");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const qs = require("qs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

function sendLog(socket, message) {
  console.log(message);
  if (socket) socket.emit("log", { message, time: new Date().toISOString() });
}

/* ===================================================== */
/* 🔎 SEARCH ETSY + REVERSE IMAGE GOOGLE → FILTER ALIEXPRESS */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    // 🔹 Récupérer les annonces Etsy
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true },
    });

    const html = scraperRes.data;
    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;
    const etsyImages = [...html.matchAll(imageRegex)].map((m) => m[0]);
    const etsyLinks = [...html.matchAll(linkRegex)].map((m) => m[0]);

    const results = [];

    for (let i = 0; i < Math.min(maxItems, etsyImages.length); i++) {
      const etsyImage = etsyImages[i];
      const etsyLink = etsyLinks[i] || etsyUrl;

      // 🔹 Reverse image Google
      const googleUrl = `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(etsyImage)}&encoded_image=&image_content=&filename=&hl=en`;

      const googleRes = await axios.get("https://api.scraperapi.com/", {
        params: { api_key: process.env.SCRAPAPI_KEY, url: googleUrl, render: true },
      });

      const googleHtml = googleRes.data;

      // 🔹 Filtrer AliExpress
      const aliLinkRegex = /https?:\/\/(www\.)?aliexpress\.com\/item\/[^\s"']+/g;
      const aliImgRegex = /<img[^>]+src="([^">]+)"/g;

      const aliLinks = [...googleHtml.matchAll(aliLinkRegex)].map((m) => m[0]);
      const aliImages = [...googleHtml.matchAll(aliImgRegex)].map((m) => m[1]);

      // Prendre les 5 premiers
      const aliResults = [];
      for (let j = 0; j < Math.min(5, aliLinks.length); j++) {
        aliResults.push({ image: aliImages[j] || aliLinks[j], link: aliLinks[j] });
      }

      results.push({
        etsy: { image: etsyImage, link: etsyLink },
        aliexpress: aliResults,
      });
    }

    res.json({ results });
  } catch (err) {
    console.error("Search Error:", err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

/* ===================================================== */
/* SOCKET */
io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ===================================================== */
/* SERVER START */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
