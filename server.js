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

/* =====================================================
LOG SYSTEM
==================================================== */
function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) {
    socket.emit("log", { message, type, time: new Date().toISOString() });
  }
}

/* =====================================================
UPLOAD IMAGE TO IMGBB
==================================================== */
async function uploadToImgBB(imageBuffer) {
  const base64 = imageBuffer.toString("base64");
  const response = await axios.post(
    "https://api.imgbb.com/1/upload",
    new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return response.data.data.url;
}

/* =====================================================
CALCULATE SIMILARITY VIA OPENAI GPT-4O-MINI
==================================================== */
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
    console.error("OpenAI Vision error", err.message);
    return 0;
  }
}

/* =====================================================
SEARCH ETSY
==================================================== */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperResponse = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true }
    });

    const html = scraperResponse.data;
    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;

    const images = [...html.matchAll(imageRegex)].map(m => m[0]);
    const links = [...html.matchAll(linkRegex)].map(m => m[0]);
    const maxItems = Math.min(parseInt(limit) || 10, 50);

    const results = [];
    for (let i = 0; i < Math.min(maxItems, images.length); i++) {
      results.push({ image: images[i], link: links[i] || etsyUrl });
    }

    res.json({ results });
  } catch (err) {
    console.error("Etsy scrape error:", err.message);
    res.status(500).json({ error: "Etsy search failed" });
  }
});

/* =====================================================
SEARCH ALIEXPRESS + CALCULATE SIMILARITY
==================================================== */
app.post("/search-aliexpress", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `🔎 Processing Etsy image ${file.originalname}`);
    const etsyBase64 = file.buffer.toString("base64");

    try {
      const publicImageUrl = await uploadToImgBB(file.buffer);
      sendLog(socket, "📤 Uploaded Etsy image to ImgBB");

      // SERPAPI reverse image search
      const serpRes = await axios.get("https://google.serper.dev/images", {
        params: { engine: "google_reverse_image", image_url: publicImageUrl, X-API-KEY: process.env.SERPER_API_KEY }
      });
      const aliexpressResults = (serpRes.data?.image_results || [])
        .filter(r => r.link?.includes("aliexpress.com"))
        .slice(0, 5);

      const matches = [];
      for (const item of aliexpressResults) {
        try {
          const imgResponse = await axios.get(item.thumbnail || item.image, { responseType: "arraybuffer" });
          const aliexpressBase64 = Buffer.from(imgResponse.data, "binary").toString("base64");

          const similarity = await calculateSimilarity(etsyBase64, aliexpressBase64);
          matches.push({ url: item.link, similarity: Math.round(similarity * 100) });
        } catch {
          matches.push({ url: item.link, similarity: 0 });
        }
      }

      results.push({ image: file.originalname, matches });
    } catch (err) {
      sendLog(socket, `Error processing Etsy item: ${err.message}`, "error");
    }
  }

  res.json({ results });
});

/* =====================================================
SOCKET
==================================================== */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  sendLog(socket, "🟢 Client connected");
});

/* =====================================================
START SERVER
==================================================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
