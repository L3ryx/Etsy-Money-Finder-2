require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ===================================================== */
/* MIDDLEWARE */
/* ===================================================== */
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* ===================================================== */
/* LOG SYSTEM */
/* ===================================================== */
function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) {
    socket.emit("log", { message, type, time: new Date().toISOString() });
  }
}

/* ===================================================== */
/* ETSY SEARCH ROUTE */
/* ===================================================== */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperResponse = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true },
    });
    const html = scraperResponse.data;

    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;

    const images = [...html.matchAll(imageRegex)].map(m => m[0]);
    const links = [...html.matchAll(linkRegex)].map(m => m[0]);
    const maxItems = Math.min(parseInt(limit) || 10, 50);

    const results = [];
    for (let i = 0; i < Math.min(maxItems, images.length); i++) {
      results.push({ etsyImage: images[i], etsyLink: links[i] || etsyUrl });
    }

    res.json({ results });
  } catch (err) {
    console.error("ScraperAPI Error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* ===================================================== */
/* FIND ALIEXPRESS ROUTE + SIMILARITY */
/* ===================================================== */
app.post("/find-aliexpress", async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);

  try {
    sendLog(socket, "🔎 Searching AliExpress images...");

    // Search images via Serper (Google reverse image)
    const serperRes = await axios.get("https://google.serper.dev/images", {
      params: { engine: "google_reverse_image", image_url: etsyImage, X_API_KEY: process.env.SERPER_API_KEY },
    });

    const serperResults = serperRes.data?.image_results || [];
    const topAliImages = serperResults.filter(r => r.link?.includes("aliexpress.com")).slice(0, 5);

    const matches = [];

    for (const ali of topAliImages) {
      const aliImageUrl = ali.thumbnail || ali.image || ali.link;

      // OpenAI Vision similarity check
      try {
        const vision = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Return similarity score between 0 and 100." },
                  { type: "image_url", image_url: { url: etsyImage } },
                  { type: "image_url", image_url: { url: aliImageUrl } },
                ],
              },
            ],
          },
          { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
        );

        const text = vision.data.choices[0].message.content;
        const matchScore = text.match(/\d+/);
        const similarity = matchScore ? parseInt(matchScore[0]) : 0;

        sendLog(socket, `Similarity with ${ali.link}: ${similarity}%`);

        if (similarity >= 70) {
          matches.push({ aliImage: aliImageUrl, aliLink: ali.link, similarity });
        }
      } catch (err) {
        sendLog(socket, `OpenAI Vision failed for image ${ali.link}`, "error");
      }
    }

    res.json({ matches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error finding AliExpress matches" });
  }
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
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
