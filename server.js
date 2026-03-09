require("dotenv").config();
const express = require("express");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// TEST SOCKET
io.on("connection", (socket) => {
  console.log("🟢 Client connected");
});

// ROUTE : récupérer Etsy images via mot-clé
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  const maxItems = Math.min(parseInt(limit) || 5, 5);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const response = await axios.get(etsyUrl);
    const html = response.data;

    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const images = [...html.matchAll(imageRegex)].map(m => m[0]).slice(0, maxItems);

    res.json({ results: images.map(img => ({ image: img, link: "#" })) });
  } catch (err) {
    console.error("Etsy fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch Etsy images" });
  }
});

// ROUTE : analyse images Etsy et recherche sur AliExpress
app.post("/analyze-etsy", async (req, res) => {
  const { etsyImages } = req.body;
  if (!etsyImages || !etsyImages.length) return res.status(400).json({ error: "No Etsy images provided" });

  const results = [];

  for (const etsyImage of etsyImages) {
    try {
      console.log("🔎 Searching AliExpress for Etsy image:", etsyImage);

      // Rechercher images AliExpress (Serper API)
      const searchRes = await axios.post(
        "https://google.serper.dev/images",
        { q: "site:aliexpress.com", image_url: etsyImage, num: 5 },
        { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
      );

      const aliImages = (searchRes.data.images || []).slice(0, 5);

      for (const ali of aliImages) {
        // Comparer via OpenAI Vision
        const visionRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Return similarity score 0 to 100" },
                  { type: "image_url", image_url: { url: etsyImage } },
                  { type: "image_url", image_url: { url: ali.thumbnail || ali.link } }
                ]
              }
            ]
          },
          { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
        );

        const text = visionRes.data.choices[0].message.content;
        const score = parseInt(text.match(/\d+/)?.[0] || "0");
        console.log("Similarity score:", score);

        if (score >= 40) {
          results.push({
            etsyImage,
            aliImage: ali.thumbnail || ali.link,
            aliLink: ali.link,
            similarity: score
          });
        }
      }
    } catch (err) {
      console.error("Analyze Etsy image error:", err.message);
    }
  }

  if (results.length === 0) console.log("No results with similarity ≥ 40%");
  res.json({ results });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
