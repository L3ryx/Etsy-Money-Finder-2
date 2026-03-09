require("dotenv").config();
const express = require("express");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

function sendLog(socket, message, type = "info") {
  console.log(`[${type}] ${message}`);
  if (socket) socket.emit("log", { message, type, time: new Date().toISOString() });
}

// Calcul similarity avec OpenAI
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
    console.error("Similarity error:", err.message);
    return 0;
  }
}

// Recherche Etsy
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true }
    });
    const html = scraperRes.data;

    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;

    const images = [...html.matchAll(imageRegex)].map(m => m[0]);
    const links = [...html.matchAll(linkRegex)].map(m => m[0]);

    const results = images.slice(0, Math.min(limit || 10, 50)).map((img, i) => ({
      etsyImage: img,
      etsyLink: links[i] || etsyUrl
    }));

    res.json({ results });
  } catch (err) {
    console.error("Etsy scraping error:", err.message);
    res.status(500).json({ error: "Etsy scraping failed" });
  }
});

// Recherche et comparaison automatique AliExpress
app.post("/find-aliexpress", async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);
  sendLog(socket, "🔎 Processing Etsy image");

  try {
    const serperRes = await axios.get("https://google.serper.dev/images", {
      params: { engine: "google_reverse_image", image_url: etsyImage },
      headers: { "X-API-KEY": process.env.SERPER_API_KEY }
    });

    let aliResults = serperRes.data.image_results
      .filter(r => r.link?.includes("aliexpress.com"))
      .slice(0, 5); // Top 5

    const etsyBase64Res = await axios.get(etsyImage, { responseType: "arraybuffer" });
    const etsyBase64 = Buffer.from(etsyBase64Res.data, "binary").toString("base64");

    // Compare toutes les images en parallèle
    const matches = await Promise.all(
      aliResults.map(async item => {
        const imageUrl = item.thumbnail || item.image;
        if (!imageUrl) return null;

        try {
          const aliRes = await axios.get(imageUrl, { responseType: "arraybuffer" });
          const aliBase64 = Buffer.from(aliRes.data, "binary").toString("base64");
          const similarity = await calculateSimilarity(etsyBase64, aliBase64);
          if (similarity >= 0.7) {
            return { aliImage: imageUrl, aliLink: item.link, similarity };
          }
        } catch {
          return null;
        }
        return null;
      })
    );

    res.json({ etsyImage, matches: matches.filter(m => m) });
  } catch (err) {
    console.error("AliExpress matching error:", err.message);
    res.status(500).json({ error: "AliExpress matching failed" });
  }
});

io.on("connection", socket => {
  console.log("🟢 Client connected");
  socket.emit("connected", { socketId: socket.id });
});

server.listen(process.env.PORT || 3000, () => console.log("🚀 Server running"));
