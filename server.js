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
/* 🔎 ETSY SEARCH (IMAGE + LINK) */
/* ===================================================== */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);
  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true },
    });

    const html = scraperRes.data;
    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;

    const images = [...html.matchAll(imageRegex)].map(m => m[0]);
    const links = [...html.matchAll(linkRegex)].map(m => m[0]);

    const etsyResults = [];
    for (let i = 0; i < Math.min(maxItems, images.length); i++) {
      etsyResults.push({ image: images[i], link: links[i] || etsyUrl });
    }

    res.json({ results: etsyResults });
  } catch (err) {
    console.error("ScraperAPI Error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* ===================================================== */
/* 🔄 REVERSE IMAGE SEARCH + COMPARISON (AUTO) */
/* ===================================================== */
app.post("/compare-etsy-aliexpress", async (req, res) => {
  const { etsyResults } = req.body;
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);

  if (!etsyResults || !etsyResults.length)
    return res.status(400).json({ error: "No Etsy images provided" });

  const finalResults = [];

  for (const etsy of etsyResults) {
    sendLog(socket, `🔎 Searching AliExpress images for Etsy image`);

    try {
      // REVERSE IMAGE SEARCH via SERPER API
      const serpRes = await axios.post(
        "https://google.serper.dev/images",
        {
          q: "site:aliexpress.com",
          image_url: etsy.image,
          num: 5,
        },
        { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
      );

      const aliImages = (serpRes.data?.images || []).slice(0, 5);

      const matches = [];
      for (const ali of aliImages) {
        // Compare with OpenAI Vision
        try {
          const visionRes = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Return similarity score between 0 and 100." },
                    { type: "image_url", image_url: { url: etsy.image } },
                    { type: "image_url", image_url: { url: ali.thumbnail || ali.link } }
                  ]
                }
              ]
            },
            {
              headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
            }
          );

          const scoreText = visionRes.data.choices[0].message.content;
          const score = parseInt(scoreText.match(/\d+/)?.[0] || "0");
          console.log("Similarity score:", score);

          if (score >= 40) { // Seuil 40%
            matches.push({
              etsyImage: etsy.image,
              etsyLink: etsy.link,
              aliImage: ali.thumbnail || ali.link,
              aliLink: ali.link,
              similarity: score
            });
          }

        } catch (err) {
          console.error("OpenAI Vision Error:", err.message);
        }
      }

      if (matches.length) finalResults.push(...matches);

    } catch (err) {
      console.error("Serper Error:", err.message);
    }
  }

  if (!finalResults.length) {
    return res.json({ message: "No results with similarity ≥ 40%" });
  }

  res.json({ results: finalResults });
});

/* ===================================================== */
/* SOCKET CONNECTION */
/* ===================================================== */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ===================================================== */
/* START SERVER */
/* ===================================================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
