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

/* ===================================================== */
/* 🔎 ETSY SEARCH (IMAGE + LINK) */
/* ===================================================== */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    // URL Etsy
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;

    // ScraperAPI pour récupérer HTML Etsy
    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: {
        api_key: process.env.SCRAPAPI_KEY,
        url: etsyUrl,
        render: true
      }
    });

    const html = scraperRes.data;

    // Extraction images et liens Etsy
    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;

    const images = [...html.matchAll(imageRegex)].map(m => m[0]);
    const links = [...html.matchAll(linkRegex)].map(m => m[0]);

    const results = [];

    for (let i = 0; i < Math.min(maxItems, images.length); i++) {
      const etsyImage = images[i];
      const etsyLink = links[i] || etsyUrl;

      // Reverse Image Search Google via ScraperAPI
      const reverseUrl = `https://www.google.com/searchbyimage?&image_url=${encodeURIComponent(etsyImage)}`;

      const reverseRes = await axios.get("https://api.scraperapi.com/", {
        params: {
          api_key: process.env.SCRAPAPI_KEY,
          url: reverseUrl,
          render: true
        }
      });

      const reverseHTML = reverseRes.data;

      // Extraire uniquement liens AliExpress
      const aliexpressRegex = /https:\/\/www\.aliexpress\.com\/item\/\d+/g;
      const aliexpressLinks = [...reverseHTML.matchAll(aliexpressRegex)]
        .map(m => m[0])
        .slice(0, 5);

      // Créer objets avec miniatures
      const aliexpressResults = aliexpressLinks.map(link => ({
        link,
        image: `${link}` // On peut garder la même image Etsy ou récupérer thumbnail via scraping plus avancé
      }));

      results.push({
        etsy: { image: etsyImage, link: etsyLink },
        aliexpress: aliexpressResults
      });
    }

    res.json({ results });

  } catch (err) {
    console.error("Search Error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* ===================================================== */
/* SOCKET CONNECTION (optionnel pour log) */
/* ===================================================== */
io.on("connection", socket => {
  console.log("🟢 Client connected:", socket.id);
});

/* ===================================================== */
/* SERVER START */
/* ===================================================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
