// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 10000;

// ================= SOCKET =================
io.on("connection", (socket) => {
  console.log("🟢 Client connected");
});

// ================= ROUTE =================
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;

  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  try {
    // 🔹 Recherche Etsy via API Scraper ou endpoint fictif
    const etsyResponse = await axios.get(
      `https://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent(
        `https://www.etsy.com/search?q=${keyword}&limit=${limit}`
      )}`
    );

    const etsyResults = etsyResponse.data.results || []; // tableau d'objets {image, link}

    const finalResults = [];

    // 🔹 Reverse image + AliExpress filter (5 premiers résultats)
    for (const item of etsyResults.slice(0, 5)) {
      const imageUrl = item.image;

      // 🔹 Reverse image search sur Google Images (simplifié)
      // Ici, on suppose que Google renvoie des liens dans `reverseResults`
      const reverseResponse = await axios.get(
        `https://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent(
          `https://www.google.com/searchbyimage?image_url=${imageUrl}`
        )}`
      );

      // 🔹 Filtrage AliExpress sur les liens trouvés
      const reverseHtml = reverseResponse.data;
      const aliexpressMatches = [...reverseHtml.matchAll(/https:\/\/www\.aliexpress\.com\/item\/\d+/g)];
      const aliLinks = aliexpressMatches.map((m) => m[0]).slice(0, 5);

      // 🔹 On prend la première image AliExpress pour chaque lien
      const aliResults = [];
      for (const link of aliLinks) {
        aliResults.push({ image: imageUrl, link }); // ici simplifié, peut être remplacé par scraping réel
      }

      finalResults.push({
        etsy: { image: item.image, link: item.link },
        aliexpress: aliResults[0] || null,
      });
    }

    res.json({ results: finalResults });
  } catch (err) {
    console.error("Search Error:", err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
