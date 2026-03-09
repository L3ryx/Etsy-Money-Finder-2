require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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
/* ETSY SEARCH (IMAGE + LINK EXTRACTION) */
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

    const images = [...html.matchAll(imageRegex)].map((m) => m[0]);
    const links = [...html.matchAll(linkRegex)].map((m) => m[0]);

    const results = [];
    for (let i = 0; i < Math.min(maxItems, images.length); i++) {
      results.push({ etsyImage: images[i], etsyLink: links[i] || etsyUrl });
    }

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* ===================================================== */
/* FIND ALIEXPRESS + OPENAI SIMILARITY */
/* ===================================================== */
app.post("/find-aliexpress", async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  try {
    sendLog(socket, "🔎 Calling Serper for AliExpress matches");

    // STEP 1 — Get AliExpress image search results
    const serperRes = await axios.get("https://google.serper.dev/images", {
      params: {
        engine: "google_reverse_image",
        image_url: etsyImage,
        "X-API-KEY": process.env.SERPER_API_KEY,
      },
    });

    let serperResults = serperRes.data?.image_results || [];
    serperResults = serperResults.filter((r) => r.link?.includes("aliexpress.com")).slice(0, 5);

    // STEP 2 — OpenAI Vision similarity check
    const matches = [];
    for (const item of serperResults) {
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
                  { type: "image_url", image_url: { url: item.thumbnail || item.image } },
                ],
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        const text = vision.data.choices[0].message.content;
        const matchValue = text.match(/\d+/);
        const similarity = matchValue ? parseInt(matchValue[0]) : 0;

        sendLog(socket, `AI Similarity with AliExpress image: ${similarity}%`);

        if (similarity >= 70) {
          matches.push({ aliImage: item.thumbnail || item.image, aliLink: item.link, similarity: similarity / 100 });
        }
      } catch (err) {
        sendLog(socket, "OpenAI Vision failed", "error");
      }
    }

    results.push({ etsyImage, matches });
    res.json({ matches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AliExpress search failed" });
  }
});

/* ===================================================== */
/* SOCKET CONNECTION */
/* ===================================================== */
io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ===================================================== */
/* START SERVER */
/* ===================================================== */
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
