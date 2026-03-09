// server.js
import "dotenv/config";
import express from "express";
import multer from "multer";
import axios from "axios";
import http from "http";
import { Server } from "socket.io";

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
SEARCH ETSY
==================================================== */
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

/* =====================================================
ANALYZE IMAGES + FIND ALIEXPRESS MATCHES
==================================================== */
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `Processing ${file.originalname}`);

    const base64 = file.buffer.toString("base64");
    let etsyImageUrl;

    // Upload Etsy image to IMGBB
    try {
      const uploadRes = await axios.post(
        "https://api.imgbb.com/1/upload",
        new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
      );
      etsyImageUrl = uploadRes.data.data.url;
      sendLog(socket, "Uploaded Etsy image to IMGBB");
    } catch (err) {
      sendLog(socket, "IMGBB upload failed", "error");
      continue;
    }

    // Call Serper for image search
    sendLog(socket, "🔎 Calling Serper");
    let serperResults = [];
    try {
      const response = await axios.get("https://google.serper.dev/images", {
        params: { engine: "google_reverse_image", image_url: etsyImageUrl },
        headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      });
      serperResults = response.data?.image_results || [];
      sendLog(socket, `📦 ${serperResults.length} results found`);
    } catch (err) {
      sendLog(socket, `❌ Serper error | ${err.response?.status || err.message}`, "error");
      serperResults = [];
    }

    // Filter AliExpress results (limit to first 5)
    const aliexpressLinks = serperResults.filter(r => r.link?.includes("aliexpress.com")).slice(0, 5);

    const matches = [];
    for (const item of aliexpressLinks) {
      try {
        const imgRes = await axios.get(item.thumbnail || item.image, { responseType: "arraybuffer" });
        const base64Ali = Buffer.from(imgRes.data, "binary").toString("base64");
        const sim = await calculateSimilarity(base64, base64Ali);
        matches.push({ url: item.link, similarity: (sim * 100).toFixed(2) });
      } catch {
        matches.push({ url: item.link, similarity: "N/A" });
      }
    }

    results.push({ etsyImage: etsyImageUrl, etsyName: file.originalname, matches });
  }

  res.json({ results });
});

/* =====================================================
CALCULATE SIMILARITY VIA OPENAI
==================================================== */
async function calculateSimilarity(base64A, base64B) {
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
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64B}` } },
          ],
        },
      ],
    },
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  );

  const text = response.data.choices[0].message.content;
  const match = text.match(/0\.\d+|1(\.0+)?/);
  return match ? parseFloat(match[0]) : 0;
}

/* =====================================================
SOCKET.IO
==================================================== */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* =====================================================
START SERVER
==================================================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
