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

// ===========================================
// SOCKET.IO
// ===========================================
io.on("connection", (socket) => {
  console.log("🟢 Client connected");
  socket.emit("connected", { socketId: socket.id });
});

// ===========================================
// REVERSE IMAGE SEARCH
// ===========================================
async function searchAliExpressImages(imageUrl, limit = 5) {
  try {
    const response = await axios.post(
      "https://google.serper.dev/images",
      { q: "site:aliexpress.com", image_url: imageUrl, num: limit },
      { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
    );

    if (!response.data?.images) return [];

    return response.data.images.slice(0, limit).map(img => ({
      image: img.thumbnail || img.link,
      link: img.link
    }));
  } catch (err) {
    console.error("Serper search error:", err.message);
    return [];
  }
}

// ===========================================
// OPENAI IMAGE SIMILARITY
// ===========================================
async function checkSimilarity(imageA, imageB) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Return only similarity score between 0 and 100." },
              { type: "image_url", image_url: { url: imageA } },
              { type: "image_url", image_url: { url: imageB } }
            ]
          }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    const text = response.data.choices[0].message.content;
    const match = text.match(/\d+/);
    const score = match ? parseInt(match[0]) : 0;
    console.log("Similarity score:", score, imageA, imageB);
    return score;
  } catch (err) {
    console.error("OpenAI Vision error:", err.message);
    return 0;
  }
}

// ===========================================
// ANALYZE ROUTE
// ===========================================
app.post("/analyze-etsy", async (req, res) => {
  const { etsyImages } = req.body;
  if (!etsyImages || !Array.isArray(etsyImages)) {
    return res.status(400).json({ error: "etsyImages must be an array of URLs" });
  }

  const results = [];

  for (let i = 0; i < etsyImages.length; i++) {
    const etsyImage = etsyImages[i];
    console.log(`🔎 Searching AliExpress images for Etsy image ${i + 1}`);

    const aliImages = await searchAliExpressImages(etsyImage, 5);

    for (const ali of aliImages) {
      const score = await checkSimilarity(etsyImage, ali.image);

      // ✅ garder uniquement les scores >= 40%
      if (score >= 40) {
        results.push({
          etsyImage,
          aliImage: ali.image,
          aliLink: ali.link,
          similarity: score
        });
      }
    }
  }

  if (results.length === 0) {
    console.log("No results with similarity >= 40%");
  }

  res.json({ results });
});

// ===========================================
// START SERVER
// ===========================================
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
