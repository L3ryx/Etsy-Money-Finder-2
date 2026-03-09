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
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* ===================================================== */
/* SOCKET LOG SYSTEM */
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", { message, time: new Date().toISOString() });
  }
}

/* ===================================================== */
/* 🔎 ETSY SEARCH */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);
  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;

    const scraperResponse = await axios.get("https://api.scraperapi.com", {
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
/* 🧠 IMAGE ANALYSIS + REVERSE IMAGE + AliExpress */
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);

  const results = [];

  for (const file of req.files) {
    sendLog(socket, `Processing ${file.originalname}`);
    const base64 = file.buffer.toString("base64");

    /* ===== UPLOAD IMAGE IMGBB ===== */
    let imageUrl;
    try {
      const uploadRes = await axios.post(
        "https://api.imgbb.com/1/upload",
        new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
      );
      imageUrl = uploadRes.data.data.url;
      sendLog(socket, "Uploaded to IMGBB");
    } catch (err) {
      sendLog(socket, "IMGBB upload failed");
      continue;
    }

    /* ===== REVERSE IMAGE + AliExpress ===== */
    try {
      const reverseUrl = "https://api.scraperapi.com";
      const aliResponse = await axios.get(reverseUrl, {
        params: {
          api_key: process.env.SCRAPAPI_KEY,
          url: `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(imageUrl)}`,
          render: true
        }
      });

      const html = aliResponse.data;
      const imageRegex = /https:\/\/[^"]*\.jpg/g;
      const linkRegex = /https:\/\/www\.aliexpress\.com\/item\/[^"]+/g;

      const images = [...html.matchAll(imageRegex)].map(m => m[0]).slice(0, 5);
      const links = [...html.matchAll(linkRegex)].map(m => m[0]).slice(0, 5);

      const matches = [];
      for (let i = 0; i < images.length; i++) {
        matches.push({ image: images[i], link: links[i] || "#" });
      }

      results.push({ etsyImage: imageUrl, matches });

    } catch (err) {
      sendLog(socket, "Reverse Image + AliExpress failed");
    }
  }

  res.json({ results });
});

/* ===================================================== */
/* SOCKET CONNECTION */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ===================================================== */
/* SERVER START */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
