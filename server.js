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

function sendLog(socket, message) {
  console.log(message);
  if (socket) socket.emit("log", { message, time: new Date().toISOString() });
}

/* ====================== */
/* 🔎 ETSY SEARCH */
/* ====================== */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);
  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const resp = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true },
    });

    const html = resp.data;
    const images = [...html.matchAll(/https:\/\/i\.etsystatic\.com[^"]+/g)].map(m => m[0]);
    const links = [...html.matchAll(/https:\/\/www\.etsy\.com\/listing\/\d+/g)].map(m => m[0]);

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

/* ====================== */
/* 🧠 IMAGE ANALYSIS PIPELINE */
/* ====================== */
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `Starting image analysis: ${file.originalname}`);
    const base64Etsy = file.buffer.toString("base64");

    // Upload to IMGBB
    let imageUrl;
    try {
      const imgbb = await axios.post(
        "https://api.imgbb.com/1/upload",
        new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64Etsy })
      );
      imageUrl = imgbb.data.data.url;
      sendLog(socket, "Uploaded Etsy image to IMGBB");
    } catch {
      sendLog(socket, "IMGBB upload failed");
      continue;
    }

    // Google reverse image via Serper
    let serperResults = [];
    try {
      const resp = await axios.post(
        "https://google.serper.dev/images",
        { image_url: imageUrl },
        { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
      );
      serperResults = resp.data?.image_results || [];
      sendLog(socket, `Found ${serperResults.length} reverse image results`);
    } catch (err) {
      sendLog(socket, "Serper search failed");
    }

    // Filter AliExpress
    const aliResults = serperResults.filter(r => r.link?.includes("aliexpress.com")).slice(0, 5);

    let matched = null;
    for (const item of aliResults) {
      try {
        const imgResp = await axios.get(item.thumbnail, { responseType: "arraybuffer" });
        const base64Ali = Buffer.from(imgResp.data).toString("base64");
        const similarity = await calculateSimilarity(base64Etsy, base64Ali);
        sendLog(socket, `Compared with AliExpress: ${similarity}%`);

        if (similarity >= 60) {
          matched = { aliImage: item.thumbnail, aliLink: item.link, similarity };
          break;
        }
      } catch {
        sendLog(socket, "Error comparing images with OpenAI");
      }
    }

    results.push({ etsyImage: imageUrl, etsyLink: file.originalname, aliMatch: matched });
  }

  res.json({ results });
});

/* ====================== */
/* OpenAI Similarity API */
/* ====================== */
async function calculateSimilarity(imgA, imgB) {
  try {
    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: [{ type: "text", text: "Return similarity score 0-100." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgA}` } },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgB}` } }] }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
    );

    const text = resp.data.choices[0].message.content;
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  } catch (err) {
    console.error("OpenAI error:", err.message);
    return 0;
  }
}

/* ====================== */
/* SOCKET CONNECTION */
/* ====================== */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("Client connected:", socket.id);
});

/* ====================== */
/* SERVER START */
/* ====================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("Server running on port", PORT));
