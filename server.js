require("dotenv").config();
const express = require("express");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const { Buffer } = require("buffer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

function sendLog(socket, message) {
  console.log(message);
  if (socket) socket.emit("log", { message, time: new Date().toISOString() });
}

/* -------------------- ETSY SEARCH -------------------- */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  const maxItems = Math.min(parseInt(limit) || 10, 50);

  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const html = (await axios.get("https://api.scraperapi.com/", {
      params: { api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render: true }
    })).data;

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

/* -------------------- UPLOAD IMAGE TO IMGBB -------------------- */
async function uploadToImgBB(imageUrl) {
  const buffer = (await axios.get(imageUrl, { responseType: "arraybuffer" })).data;
  const base64 = Buffer.from(buffer).toString("base64");
  const res = await axios.post(
    "https://api.imgbb.com/1/upload",
    new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
  );
  return res.data.data.url;
}

/* -------------------- ANALYZE IMAGES -------------------- */
app.post("/analyze-etsy", async (req, res) => {
  const { etsyResults } = req.body;
  const finalResults = [];

  for (const etsyItem of etsyResults) {
    try {
      sendLog(null, `Processing Etsy image: ${etsyItem.link}`);
      const etsyPublicUrl = await uploadToImgBB(etsyItem.image);

      // Recherche AliExpress via Serper
      const aliRes = await axios.get("https://google.serper.dev/images", {
        params: { engine: "google_reverse_image", image_url: etsyItem.image, num: 5 },
        headers: { "X-API-KEY": process.env.SERPER_API_KEY }
      });

      const aliResults = (aliRes.data.image_results || []).slice(0, 5);

      for (const aliItem of aliResults) {
        try {
          const aliPublicUrl = await uploadToImgBB(aliItem.thumbnail || aliItem.link);

          // Compare via OpenAI
          const visionRes = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
              model: "gpt-4o-mini",
              messages: [
                { role: "user", content: [
                  { type: "text", text: "Return similarity score 0-100" },
                  { type: "image_url", image_url: { url: etsyPublicUrl } },
                  { type: "image_url", image_url: { url: aliPublicUrl } }
                ] }
              ]
            },
            { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
          );

          const scoreText = visionRes.data.choices[0].message.content;
          const score = scoreText.match(/\d+/) ? parseInt(scoreText.match(/\d+/)[0]) : 0;
          console.log("Similarity score:", score);

          if (score >= 40) {
            finalResults.push({
              etsyImage: etsyItem.image,
              etsyLink: etsyItem.link,
              aliImage: aliItem.thumbnail || aliItem.link,
              aliLink: aliItem.link,
              similarity: score
            });
          }
        } catch {
          sendLog(null, "OpenAI Vision error");
        }
      }
    } catch {
      sendLog(null, "Error processing Etsy item");
    }
  }

  res.json({ results: finalResults });
});

/* -------------------- SOCKET -------------------- */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("Client connected");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
