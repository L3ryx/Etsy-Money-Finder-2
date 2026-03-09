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

/* =========================
   LOG SYSTEM
========================= */
function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) {
    socket.emit("log", { message, type, time: new Date().toISOString() });
  }
}

/* =========================
   SIMILARITY FUNCTION
========================= */
async function calculateSimilarity(base64A, base64B) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Return only similarity 0 to 1." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64A}` } },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64B}` } }
            ]
          }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    const text = response.data.choices[0].message.content;
    const match = text.match(/0\.\d+|1(\.0+)?/);
    return match ? parseFloat(match[0]) : 0;
  } catch (err) {
    console.error("Similarity error:", err.message);
    return 0;
  }
}

/* =========================
   ETSY SEARCH
========================= */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
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

    const results = images.slice(0, maxItems).map((img, i) => ({
      etsyImage: img,
      etsyLink: links[i] || etsyUrl
    }));

    res.json({ results });
  } catch (err) {
    console.error("Etsy scraping error:", err.message);
    res.status(500).json({ error: "Etsy scraping failed" });
  }
});

/* =========================
   FIND ALIEXPRESS MATCHES AUTOMATICALLY
========================= */
app.post("/find-aliexpress", upload.none(), async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);
  sendLog(socket, "🔎 Processing Etsy image");

  try {
    // 1. Call Serper for Google Reverse Image
    const serperRes = await axios.get("https://google.serper.dev/images", {
      params: { engine: "google_reverse_image", image_url: etsyImage },
      headers: { "X-API-KEY": process.env.SERPER_API_KEY }
    });
    let aliexpressResults = serperRes.data.image_results
      .filter(r => r.link?.includes("aliexpress.com"))
      .slice(0, 5); // 5 premières images

    const matches = [];

    // 2. Compare similarity avec OpenAI
    const etsyBase64Res = await axios.get(etsyImage, { responseType: "arraybuffer" });
    const etsyBase64 = Buffer.from(etsyBase64Res.data, "binary").toString("base64");

    for (const item of aliexpressResults) {
      const aliexpressBase64Res = await axios.get(item.thumbnail, { responseType: "arraybuffer" });
      const aliBase64 = Buffer.from(aliexpressBase64Res.data, "binary").toString("base64");

      const similarity = await calculateSimilarity(etsyBase64, aliBase64);

      if (similarity >= 0.7) {
        matches.push({
          aliImage: item.thumbnail,
          aliLink: item.link,
          similarity
        });
      }
    }

    res.json({ etsyImage, matches });
  } catch (err) {
    console.error("AliExpress matching error:", err.message);
    res.status(500).json({ error: "AliExpress matching failed" });
  }
});

/* =========================
   SOCKET.IO
========================= */
io.on("connection", socket => {
  console.log("🟢 Client connected");
  socket.emit("connected", { socketId: socket.id });
});

/* =========================
   START SERVER
========================= */
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
