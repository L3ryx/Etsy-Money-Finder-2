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

// ===============================
// SOCKET.IO
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 Client connected");
  socket.emit("connected", { socketId: socket.id });
});

// ===============================
// REVERSE IMAGE SEARCH + COMPARISON
// ===============================
app.post("/analyze-etsy", async (req, res) => {
  const { keyword } = req.body;

  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  try {
    // 1️⃣ Scraper Etsy
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: {
        api_key: process.env.SCRAPAPI_KEY,
        url: etsyUrl,
        render: true,
      },
    });

    const html = scraperRes.data;

    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;

    const etsyImages = [...html.matchAll(imageRegex)].map(m => m[0]);
    const etsyLinks = [...html.matchAll(linkRegex)].map(m => m[0]);

    const results = [];

    // Boucle sur les images Etsy
    for (let i = 0; i < Math.min(etsyImages.length, 10); i++) {
      const etsyImage = etsyImages[i];
      const etsyLink = etsyLinks[i] || etsyUrl;

      console.log(`🔎 Searching AliExpress images for Etsy image ${i + 1}`);

      // 2️⃣ Recherche inversée Google via Serper
      const reverseRes = await axios.post(
        "https://google.serper.dev/images",
        { q: "site:aliexpress.com", image_url: etsyImage, num: 5 },
        { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
      );

      const aliexpressImages = (reverseRes.data?.images || []).slice(0, 5);

      const matches = [];

      // 3️⃣ Comparaison OpenAI Vision
      for (const item of aliexpressImages) {
        const aiRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Return similarity score between 0 and 100." },
                  { type: "image_url", image_url: { url: etsyImage } },
                  { type: "image_url", image_url: { url: item.thumbnail || item.link } },
                ],
              },
            ],
          },
          { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
        );

        const score = parseInt(aiRes.data.choices[0].message.content.match(/\d+/)?.[0] || "0");
        console.log("Similarity score:", score);

        if (score >= 70) {
          matches.push({
            aliexpressImage: item.thumbnail || item.link,
            aliexpressLink: item.link,
            similarity: score,
          });
        }
      }

      if (matches.length > 0) {
        results.push({
          etsyImage,
          etsyLink,
          matches,
        });
      }
    }

    res.json({ results });

  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Pipeline failed", detail: err.message });
  }
});

// ===============================
// START SERVER
// ===============================
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
