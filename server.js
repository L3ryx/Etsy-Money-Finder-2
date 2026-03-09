import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ===================================================== */
/* 🔎 SEARCH ETSY */
/* ===================================================== */

app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);
  const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;

  try {
    // Appel ScraperAPI pour récupérer le HTML d'Etsy
    const htmlRes = await axios.get("https://api.scraperapi.com/", {
      params: {
        api_key: process.env.SCRAPERAPI_KEY,
        url: etsyUrl,
        render: true
      }
    });

    const html = htmlRes.data;
    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const images = [...html.matchAll(imageRegex)].map(m => m[0]).slice(0, maxItems);

    const results = [];

    for (const img of images) {

      // 🔹 Reverse image via Serper
      try {
        const serperRes = await axios.post(
          "https://google.serper.dev/search",
          { image_url: img, num: 10 },
          { headers: { "X-API-KEY": process.env.SERPER_KEY, "Content-Type": "application/json" } }
        );

        // 🔹 Filtrer uniquement AliExpress
        const aliResults = (serperRes.data.image_results || [])
          .filter(r => r.link.includes("aliexpress.com"))
          .slice(0, 5);

        results.push({
          etsy_image: img,
          ali_results: aliResults.map(r => ({
            url: r.link,
            thumbnail: r.thumbnail,
            title: r.title
          }))
        });

      } catch (err) {
        console.error("Serper Error:", err.response?.data || err.message);
        results.push({ etsy_image: img, ali_results: [] });
      }
    }

    res.json({ results });

  } catch (err) {
    console.error("Etsy Scraping Error:", err.message);
    res.status(500).json({ error: "Failed to scrape Etsy" });
  }
});

/* ===================================================== */
/* START SERVER */
/* ===================================================== */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
