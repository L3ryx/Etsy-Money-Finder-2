require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ========================
// Middleware
// ========================
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ========================
// Logs via Socket
// ========================
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", { message, time: new Date().toISOString() });
  }
}

// ========================
// Etsy Search
// ========================
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });
  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: {
        api_key: process.env.SCRAPAPI_KEY,
        url: etsyUrl,
        render: true
      }
    });

    const html = scraperRes.data;
    const images = [...html.matchAll(/https:\/\/i\.etsystatic\.com[^"]+/g)].map(m => m[0]);
    const links = [...html.matchAll(/https:\/\/www\.etsy\.com\/listing\/\d+/g)].map(m => m[0]);

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

// ========================
// OpenAI similarity
// ========================
async function calculateSimilarity(imgA, imgB) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Return similarity score between 0 and 100." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgA}` } },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgB}` } }
            ]
          }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
    );

    const text = res.data.choices[0].message.content;
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  } catch (err) {
    console.error("OpenAI error:", err.message);
    return 0;
  }
}

// ========================
// Analyze Images Pipeline
// ========================
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `Starting image analysis: ${file.originalname}`);
    const base64 = file.buffer.toString("base64");

    // ------------------------
    // Upload to IMGBB
    // ------------------------
    let imgbbUrl;
    try {
      const uploadRes = await axios.post(
        "https://api.imgbb.com/1/upload",
        new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
      );
      imgbbUrl = uploadRes.data.data.url;
      sendLog(socket, "Uploaded to IMGBB");
    } catch (err) {
      sendLog(socket, "IMGBB upload failed");
      continue;
    }

    // ------------------------
    // Google Reverse Image via Serper
    // ------------------------
    let serperResults = [];
    try {
      const response = await axios.get("https://google.serper.dev/images", {
        params: { engine: "google_reverse_image", image_url: imgbbUrl },
        headers: { "X-API-KEY": process.env.SERPER_API_KEY }
      });
      serperResults = response.data?.image_results || [];
      sendLog(socket, `Found ${serperResults.length} results`);
    } catch (err) {
      sendLog(socket, `Serper search failed: ${err.message}`);
      serperResults = [];
    }

    // ------------------------
    // Filter AliExpress top 5
    // ------------------------
    const topMatches = [];
    for (const item of serperResults.slice(0, 5)) {
      const url = item.link || item.url;
      const thumb = item.thumbnail || item.image;
      if (!url?.includes("aliexpress")) continue;

      let similarity = 0;
      try {
        const aliImgRes = await axios.get(thumb, { responseType: "arraybuffer" });
        const base64B = Buffer.from(aliImgRes.data).toString("base64");
        similarity = await calculateSimilarity(base64, base64B);
      } catch (err) {
        sendLog(socket, `Similarity check failed: ${err.message}`);
      }

      topMatches.push({ url, image: thumb, similarity });
      if (similarity >= 60) break; // Stop if match >= 60%
    }

    results.push({ image: imgbbUrl, matches: topMatches });
  }

  res.json({ results });
});

// ========================
// Socket.io
// ========================
io.on("connection", socket => {
  console.log("Client connected:", socket.id);
  socket.emit("connected", { socketId: socket.id });
});

// ========================
// Server
// ========================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("Server running on port", PORT));
