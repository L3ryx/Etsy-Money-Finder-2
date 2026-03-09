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

// ----------------------------
// SOCKET LOG
// ----------------------------
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", {
      message,
      time: new Date().toISOString(),
    });
  }
}

// ----------------------------
// SEARCH ETSY
// ----------------------------
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    console.log("🔹 Fetching Etsy page via ScraperAPI:", etsyUrl);

    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true },
    });

    const html = scraperRes.data;

    const images = [...html.matchAll(/https:\/\/i\.etsystatic\.com[^"]+/g)].map(m => m[0]);
    const links = [...html.matchAll(/https:\/\/www\.etsy\.com\/listing\/\d+/g)].map(m => m[0]);

    const results = [];
    for (let i = 0; i < Math.min(maxItems, images.length); i++) {
      results.push({ image: images[i], link: links[i] || etsyUrl });
    }

    console.log(`✅ Found ${results.length} Etsy items`);
    res.json({ results });
  } catch (err) {
    console.error("❌ ScraperAPI Error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

// ----------------------------
// OPENAI IMAGE SIMILARITY
// ----------------------------
async function calculateSimilarity(imgA, imgB, socket) {
  try {
    sendLog(socket, "🧠 Calling OpenAI for similarity");
    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: [
              { type: "text", text: "Return similarity score between 0 and 100." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgA}` } },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgB}` } }
          ] },
        ],
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
    );

    const text = resp.data.choices[0].message.content;
    const match = text.match(/\d+/);
    const similarity = match ? parseInt(match[0]) : 0;
    sendLog(socket, `🟢 OpenAI similarity: ${similarity}%`);
    return similarity;
  } catch (err) {
    sendLog(socket, `❌ OpenAI error: ${err.message}`);
    return 0;
  }
}

// ----------------------------
// ANALYZE IMAGES PIPELINE
// ----------------------------
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `📂 Processing file: ${file.originalname}`);
    const base64 = file.buffer.toString("base64");

    // ----------------------------
    // Upload IMGBB
    // ----------------------------
    let imageUrl;
    try {
      sendLog(socket, "⬆ Uploading image to IMGBB...");
      const imgbbRes = await axios.post("https://api.imgbb.com/1/upload", new URLSearchParams({
        key: process.env.IMGBB_KEY,
        image: base64
      }));
      imageUrl = imgbbRes.data.data.url;
      sendLog(socket, `✅ Uploaded to IMGBB: ${imageUrl}`);
    } catch (err) {
      sendLog(socket, `❌ IMGBB upload failed: ${err.message}`);
      continue;
    }

    // ----------------------------
    // Reverse image search Serper
    // ----------------------------
    let serperResults = [];
    try {
      sendLog(socket, "🔎 Searching AliExpress images via Serper...");
      const serperResp = await axios.post("https://google.serper.dev/images", { imageUrl }, {
        headers: { "X-API-KEY": process.env.SERPER_API_KEY }
      });
      serperResults = serperResp.data.images || [];
      sendLog(socket, `📦 Serper found ${serperResults.length} images`);
    } catch (err) {
      sendLog(socket, `❌ Serper search failed: ${err.message}`);
    }

    // ----------------------------
    // Filter AliExpress and calculate similarity
    // ----------------------------
    const topResults = serperResults.slice(0, 5);
    const matches = [];

    for (const item of topResults) {
      if (!item.link?.includes("aliexpress.com")) continue;
      sendLog(socket, `🔹 Checking AliExpress item: ${item.link}`);

      let similarity = 0;
      try {
        const aliImgRes = await axios.get(item.thumbnail, { responseType: "arraybuffer" });
        const aliBase64 = Buffer.from(aliImgRes.data).toString("base64");
        similarity = await calculateSimilarity(base64, aliBase64, socket);
      } catch (err) {
        sendLog(socket, `❌ Similarity check failed: ${err.message}`);
      }

      matches.push({ url: item.link, similarity, image: item.thumbnail });

      if (similarity >= 60) {
        sendLog(socket, `⚡ Match found! Stopping further checks for this Etsy image.`);
        break;
      }
    }

    results.push({ image: imageUrl, matches });
  }

  res.json({ results });
});

// ----------------------------
// SOCKET CONNECTION
// ----------------------------
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected:", socket.id);
});

// ----------------------------
// START SERVER
// ----------------------------
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
