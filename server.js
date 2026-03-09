import "dotenv/config";
import express from "express";
import multer from "multer";
import http from "http";
import { Server } from "socket.io";
import fetch from "node-fetch";
import axios from "axios";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* =====================================================
   LOG SYSTEM
===================================================== */
function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) {
    socket.emit("log", { message, type, time: new Date().toISOString() });
  }
}

/* =====================================================
   ETSY SEARCH
===================================================== */
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
        render: true,
      },
    });

    const html = scraperRes.data;
    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;

    const images = [...html.matchAll(imageRegex)].map((m) => m[0]);
    const links = [...html.matchAll(linkRegex)].map((m) => m[0]);

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

/* =====================================================
   FIND ALIEXPRESS
===================================================== */
app.post("/find-aliexpress", async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);

  try {
    sendLog(socket, "🔎 Searching AliExpress matches...");

    // 1️⃣ Reverse image search via Serper API
    const serperRes = await fetch(
      `https://google.serper.dev/images?engine=google_reverse_image&image_url=${encodeURIComponent(
        etsyImage
      )}`,
      {
        method: "GET",
        headers: { "X-API-KEY": process.env.SERPER_API_KEY },
      }
    );

    const serperData = await serperRes.json();
    let aliexpressResults = serperData.image_results || [];

    // 2️⃣ Keep only AliExpress links
    aliexpressResults = aliexpressResults
      .filter((r) => r.link?.includes("aliexpress.com"))
      .slice(0, 5);

    const matches = [];

    // 3️⃣ Compare similarity
    for (const item of aliexpressResults) {
      const similarity = await calculateSimilarity(etsyImage, item.thumbnail);

      if (similarity >= 0.7) {
        matches.push({
          aliImage: item.thumbnail,
          aliLink: item.link,
          similarity,
        });
      }
    }

    res.json({ matches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error finding AliExpress matches" });
  }
});

/* =====================================================
   CALCULATE IMAGE SIMILARITY
===================================================== */
async function calculateSimilarity(urlA, urlB) {
  try {
    const resA = await fetch(urlA);
    const bufferA = await resA.arrayBuffer();
    const base64A = Buffer.from(bufferA).toString("base64");

    const resB = await fetch(urlB);
    const bufferB = await resB.arrayBuffer();
    const base64B = Buffer.from(bufferB).toString("base64");

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
  } catch {
    return 0;
  }
}

/* =====================================================
   SOCKET.IO
===================================================== */
io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected:", socket.id);
});

/* =====================================================
   START SERVER
===================================================== */
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
