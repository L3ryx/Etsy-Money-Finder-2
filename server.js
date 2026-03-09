require("dotenv").config();

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ========================
// Socket log helper
// ========================
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", { message, time: new Date().toISOString() });
  }
}

// ========================
// Etsy search
// ========================
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });
  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    sendLog(null, `Searching Etsy for: ${keyword}`);

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
      results.push({ image: images[i], link: links[i] || etsyUrl });
    }

    sendLog(null, `Found ${results.length} Etsy items`);
    res.json({ results });
  } catch (err) {
    console.error("ScraperAPI error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

// ========================
// OpenAI similarity
// ========================
async function calculateSimilarity(imgA, imgB) {
  try {
    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Return similarity score between 0 and 100." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgA}` } },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgB}` } },
            ],
          },
        ],
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    const text = resp.data.choices[0].message.content;
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  } catch (err) {
    console.error("OpenAI similarity error:", err.message);
    return 0;
  }
}

// ========================
// Analyze images
// ========================
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `Starting analysis for: ${file.originalname}`);
    const base64 = file.buffer.toString("base64");

    // --------------------
    // Upload to IMGBB
    // --------------------
    let imageUrl;
    try {
      const imgbbRes = await axios.post(
        "https://api.imgbb.com/1/upload",
        new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
      );
      imageUrl = imgbbRes.data.data.url;
      sendLog(socket, `Uploaded to IMGBB: ${imageUrl}`);
    } catch (err) {
      sendLog(socket, `IMGBB upload failed: ${err.message}`);
      continue;
    }

    // --------------------
    // Serper reverse image search
    // --------------------
    sendLog(socket, `Searching reverse image (Serper)`);
    let serperResults = [];
    try {
      const serperRes = await axios.post(
        "https://google.serper.dev/images",
        { imageUrl },
        { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
      );
      serperResults = serperRes.data.images || [];
      sendLog(socket, `Serper returned ${serperResults.length} results`);
    } catch (err) {
      sendLog(socket, `Serper search failed: ${err.response?.status || err.message}`);
      serperResults = [];
    }

    const topResults = serperResults.slice(0, 5);
    const matches = [];

    for (const item of topResults) {
      const link = item.link?.toLowerCase();
      if (!link || !link.includes("aliexpress")) {
        sendLog(socket, `Skipped non-AliExpress link: ${item.link}`);
        continue;
      }

      sendLog(socket, `Found potential AliExpress match: ${item.link}`);

      let similarity = 0;
      try {
        const aliImgRes = await axios.get(item.thumbnail, { responseType: "arraybuffer" });
        const base64B = Buffer.from(aliImgRes.data).toString("base64");
        similarity = await calculateSimilarity(base64, base64B);
        sendLog(socket, `Similarity with OpenAI: ${similarity}%`);
      } catch (err) {
        sendLog(socket, `Similarity check failed: ${err.message}`);
      }

      matches.push({ url: item.link, similarity, image: item.thumbnail });

      if (similarity >= 60) {
        sendLog(socket, `Stopping further comparison (similarity >= 60%)`);
        break;
      }
    }

    if (matches.length === 0) sendLog(socket, "No AliExpress matches found");

    results.push({ etsyImage: imageUrl, matches });
  }

  res.json({ results });
});

// ========================
// Socket connection
// ========================
io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });
  console.log(`Client connected: ${socket.id}`);
});

// ========================
// Server start
// ========================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
