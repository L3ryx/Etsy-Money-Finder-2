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

/* ======================= */
/* SOCKET LOG SYSTEM        */
/* ======================= */
function sendLog(socket, message) {
  console.log(message);
  if (socket) socket.emit("log", { message, time: new Date().toISOString() });
}

/* ======================= */
/* 🔎 ETSY SEARCH           */
/* ======================= */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true }
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

/* ======================= */
/* 🔄 ETYS → ALIEXPRESS → IMGBB → OPENAI */
/* ======================= */
async function uploadToImgBB(url) {
  const response = await axios.post(
    "https://api.imgbb.com/1/upload",
    new URLSearchParams({ key: process.env.IMGBB_KEY, image: url }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return response.data.data.url;
}

async function getAliExpressImages(etsyImage) {
  // Reverse image search Google via Serper
  const serpRes = await axios.post(
    "https://google.serper.dev/images",
    { q: "site:aliexpress.com", image_url: etsyImage, num: 5 },
    { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
  );

  const aliImages = (serpRes.data?.images || []).slice(0, 5)
    .filter(r => r.link?.includes("aliexpress.com"))
    .map(r => ({ image: r.thumbnail || r.link, link: r.link }));

  return aliImages;
}

async function compareImages(imageA, imageB) {
  const vision = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: [
          { type: "text", text: "Return similarity score between 0 and 100." },
          { type: "image_url", image_url: { url: imageA } },
          { type: "image_url", image_url: { url: imageB } }
        ]}
      ]
    },
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  );

  const text = vision.data.choices[0].message.content;
  const score = parseInt(text.match(/\d+/)?.[0] || "0");
  return score;
}

/* ======================= */
/* MAIN ANALYSIS ROUTE      */
/* ======================= */
app.post("/analyze-etsy", async (req, res) => {
  const { etsyResults } = req.body;
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);

  if (!etsyResults || !etsyResults.length) return res.status(400).json({ error: "No Etsy images provided" });

  const finalResults = [];

  for (const etsy of etsyResults) {
    sendLog(socket, `🔎 Searching AliExpress for Etsy image`);

    try {
      const imgbbUrl = await uploadToImgBB(etsy.image);
      const aliImages = await getAliExpressImages(imgbbUrl);

      for (const ali of aliImages) {
        const score = await compareImages(imgbbUrl, ali.image);
        console.log("Similarity score:", score);

        if (score >= 40) {
          finalResults.push({
            etsyImage: etsy.image,
            etsyLink: etsy.link,
            aliImage: ali.image,
            aliLink: ali.link,
            similarity: score
          });
        }
      }

    } catch (err) {
      console.error("Error processing Etsy image:", err.message);
    }
  }

  if (!finalResults.length) return res.json({ message: "No results with similarity ≥ 40%" });
  res.json({ results: finalResults });
});

/* ======================= */
/* SOCKET CONNECTION        */
/* ======================= */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ======================= */
/* START SERVER             */
/* ======================= */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
