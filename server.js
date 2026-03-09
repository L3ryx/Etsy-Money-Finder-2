require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ============================= */
/* MIDDLEWARE MULTER             */
/* ============================= */
const upload = multer({
  storage: multer.memoryStorage()
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* ============================= */
/* LOG SYSTEM                     */
/* ============================= */
function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) {
    socket.emit("log", { message, type, time: new Date().toISOString() });
  }
}

/* ============================= */
/* ETSY SEARCH                    */
/* ============================= */
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

/* ============================= */
/* ANALYZE IMAGES + COMPARE       */
/* ============================= */
app.post("/analyze-images", upload.array("images"), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const file of req.files) {
    sendLog(socket, `Processing ${file.originalname}`);
    const base64 = file.buffer.toString("base64");

    /* Upload image to IMGBB */
    let imageUrl;
    try {
      const uploadRes = await axios.post(
        "https://api.imgbb.com/1/upload",
        new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
      );
      imageUrl = uploadRes.data.data.url;
      sendLog(socket, "Uploaded to IMGBB");
    } catch (err) {
      sendLog(socket, "IMGBB upload failed", "error");
      continue;
    }

    /* Search AliExpress images via Serper */
    sendLog(socket, "🔎 Calling Serper");
    let serperResults = [];
    try {
      const response = await axios.get("https://google.serper.dev/images", {
        params: {
          engine: "google_reverse_image",
          image_url: imageUrl,
          "X-API-KEY": process.env.SERPER_API_KEY
        }
      });
      serperResults = response.data?.image_results || [];
      sendLog(socket, `📦 ${serperResults.length} results found`);
    } catch (err) {
      sendLog(socket, `❌ Serper error | ${err.response?.status || err.message}`, "error");
      serperResults = [];
    }

    /* Take only top 5 results */
    const topResults = serperResults.slice(0, 5);

    const matches = [];
    for (const item of topResults) {
      if (!item.link?.includes("aliexpress.com")) continue;

      /* Fetch image and compare with Etsy image using OpenAI */
      let similarity = 0;
      try {
        const aliexpressImgRes = await axios.get(item.thumbnail, { responseType: "arraybuffer" });
        const base64B = Buffer.from(aliexpressImgRes.data, "binary").toString("base64");
        similarity = await calculateSimilarity(base64, base64B);
      } catch (err) {
        sendLog(socket, `❌ Similarity check failed: ${err.message}`, "error");
      }

      matches.push({ url: item.link, similarity: similarity.toFixed(2), image: item.thumbnail });
    }

    results.push({ image: imageUrl, matches });
  }

  res.json({ results });
});

/* ============================= */
/* SIMILARITY WITH OPENAI GPT    */
/* ============================= */
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
      {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      }
    );
    const text = response.data.choices[0].message.content;
    const match = text.match(/0\.\d+|1(\.0+)?/);
    return match ? parseFloat(match[0]) : 0;
  } catch (err) {
    return 0;
  }
}

/* ============================= */
/* SOCKET.IO CONNECTION           */
/* ============================= */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* ============================= */
/* START SERVER                  */
/* ============================= */
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port " + (process.env.PORT || 3000));
});
