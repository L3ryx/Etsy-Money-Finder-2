require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ===================================================== */
/* MIDDLEWARE */
/* ===================================================== */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static("public"));

/* ===================================================== */
/* SOCKET LOG SYSTEM */
/* ===================================================== */
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", {
      message,
      time: new Date().toISOString()
    });
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

    // Call ScraperAPI
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

/* ===================================================== */
/* 🔄 ANALYZE ETSY IMAGES → ALIEXPRESS + OPENAI VISION */
/* ===================================================== */
app.post("/analyze-etsy", async (req, res) => {
  const { etsyResults, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);

  if (!etsyResults || !etsyResults.length) {
    return res.status(400).json({ results: [] });
  }

  const results = [];

  for (const etsyItem of etsyResults) {
    sendLog(socket, `🔎 Searching AliExpress for Etsy image`);

    try {
      // 1️⃣ Reverse image search with Google/Serper (filter AliExpress)
      const response = await axios.post(
        "https://google.serper.dev/images",
        {
          q: "site:aliexpress.com",
          image_url: etsyItem.image,
          num: 5
        },
        {
          headers: { "X-API-KEY": process.env.SERPER_API_KEY }
        }
      );

      const serpResults = (response.data?.images || []).slice(0, 5);

      // 2️⃣ Compare each result with OpenAI Vision
      for (const aliItem of serpResults) {
        try {
          const vision = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Return similarity score 0-100" },
                    { type: "image_url", image_url: { url: etsyItem.image } },
                    { type: "image_url", image_url: { url: aliItem.link } }
                  ]
                }
              ]
            },
            { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
          );

          const text = vision.data.choices[0].message.content;
          const match = text.match(/\d+/);
          const similarity = match ? parseInt(match[0]) : 0;

          sendLog(socket, `Similarity score: ${similarity}`);

          if (similarity >= 40) {
            results.push({
              etsyImage: etsyItem.image,
              etsyLink: etsyItem.link,
              aliImage: aliItem.thumbnail || aliItem.link,
              aliLink: aliItem.link,
              similarity
            });
          }
        } catch (err) {
          sendLog(socket, "OpenAI Vision error");
        }
      }
    } catch (err) {
      sendLog(socket, "Serper error: " + err.message);
    }
  }

  if (!results.length) sendLog(socket, "No results with similarity ≥ 40%");
  res.json({ results });
});

/* ===================================================== */
/* SOCKET CONNECTION */
/* ===================================================== */
io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ===================================================== */
/* SERVER START */
/* ===================================================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
