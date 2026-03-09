require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* ===================================================== */
/* SOCKET LOG SYSTEM */
/* ===================================================== */
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", {
      message,
      time: new Date().toISOString()
    });
  }
}

/* ===================================================== */
/* 🔎 ETSY SEARCH */
/* ===================================================== */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const response = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true }
    });

    const html = response.data;
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
    console.error("ScrapAPI Error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
});

/* ===================================================== */
/* 🧠 ANALYZE IMAGES / REVERSE IMAGE + OPENAI */
/* ===================================================== */
app.post("/analyze-images", async (req, res) => {
  const { images, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  for (const etsyImageUrl of images) {
    sendLog(socket, `Processing Etsy image: ${etsyImageUrl}`);

    try {
      // Récupérer image Etsy
      const etsyRes = await axios.get(etsyImageUrl, { responseType: "arraybuffer" });
      const etsyBase64 = Buffer.from(etsyRes.data).toString("base64");

      // Upload sur IMGBB
      let imgbbUrl = etsyImageUrl;
      try {
        const imgbbRes = await axios.post(
          "https://api.imgbb.com/1/upload",
          new URLSearchParams({
            key: process.env.IMGBB_KEY,
            image: etsyBase64
          })
        );
        imgbbUrl = imgbbRes.data.data.url;
        sendLog(socket, `Uploaded to IMGBB`);
      } catch (err) {
        sendLog(socket, `IMGBB upload failed`);
      }

      // Recherche inversée Google via Serper
      let serperResults = [];
      try {
        const serperRes = await axios.post(
          "https://google.serper.dev/images",
          { imageUrl: imgbbUrl },
          { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
        );
        serperResults = serperRes.data.images || [];
        sendLog(socket, `Found ${serperResults.length} reverse image results`);
      } catch (err) {
        sendLog(socket, `Serper search failed`);
      }

      // Filtrer AliExpress + comparer OpenAI
      const topMatches = [];
      for (const item of serperResults.slice(0, 5)) {
        if (!item.link?.includes("aliexpress")) continue;

        try {
          const aliImgRes = await axios.get(item.imageUrl, { responseType: "arraybuffer" });
          const aliBase64 = Buffer.from(aliImgRes.data).toString("base64");

          const similarity = await calculateSimilarity(etsyBase64, aliBase64);
          topMatches.push({ url: item.link, image: item.imageUrl, similarity });

          if (similarity >= 60) break;
        } catch {
          sendLog(socket, "Failed to fetch AliExpress image or compare");
        }
      }

      results.push({ image: etsyImageUrl, matches: topMatches });
    } catch (err) {
      sendLog(socket, `Failed to process Etsy image: ${err.message}`);
    }
  }

  res.json({ results });
});

/* ===================================================== */
/* OPENAI SIMILARITY */
/* ===================================================== */
async function calculateSimilarity(imgA, imgB) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: [
            { type: "text", text: "Return similarity score between 0 and 100." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgA}` } },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgB}` } }
          ]}
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
    );
    const text = response.data.choices[0].message.content;
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  } catch (err) {
    console.error("OpenAI error:", err.message);
    return 0;
  }
}

/* ===================================================== */
/* SOCKET CONNECTION */
/* ===================================================== */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("Client connected:", socket.id);
});

/* ===================================================== */
/* SERVER START */
/* ===================================================== */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
