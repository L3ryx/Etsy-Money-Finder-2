// server.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ dest: "uploads/" });

app.use(express.json());
app.use(express.static("public"));

// Stockage simple des sockets pour logging
const sockets = {};

// Socket.IO connection
io.on("connection", (socket) => {
  sockets[socket.id] = socket;
  socket.emit("connected", { socketId: socket.id });

  socket.on("disconnect", () => {
    delete sockets[socket.id];
  });
});

// Helper pour logs côté client
function sendLog(socket, message, type = "info") {
  if (socket) socket.emit("log", { type, message });
}

// Route pour rechercher Etsy
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  const results = [];

  try {
    const etsyRes = await axios.get(
      `https://openapi.etsy.com/v2/listings/active`,
      {
        params: {
          api_key: process.env.ETSY_API_KEY,
          keywords: keyword,
          limit: limit || 5,
          includes: "Images"
        }
      }
    );

    for (const item of etsyRes.data.results) {
      results.push({
        etsyImage: item.Images[0].url_170x135,
        etsyLink: item.url
      });
    }

    res.json({ results });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to search Etsy" });
  }
});

// Route pour trouver AliExpress et calculer similarité
app.post("/find-aliexpress", async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = sockets[socketId];
  const matches = [];

  sendLog(socket, "Searching AliExpress for similar products...");

  try {
    // 1️⃣ Recherche AliExpress (exemple : via API ou scraping)
    const aliRes = await axios.get(
      `https://api.aliexpress.com/fake-search`, // <- remplacer par API réelle
      { params: { image: etsyImage, limit: 5 } }
    );
    const aliItems = aliRes.data.results;

    // 2️⃣ Calcul similarité avec OpenAI Vision
    for (const ali of aliItems) {
      try {
        const visionRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Return similarity score between 0 and 100." },
                  { type: "image_url", image_url: { url: etsyImage } },
                  { type: "image_url", image_url: { url: ali.image } }
                ]
              }
            ]
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            }
          }
        );

        const text = visionRes.data.choices[0].message.content;
        const match = text.match(/\d+/);
        const similarity = match ? parseInt(match[0]) : 0;

        sendLog(socket, `Similarity with AliExpress item: ${similarity}%`);

        if (similarity >= 70) {
          matches.push({
            aliImage: ali.image,
            aliLink: ali.url,
            similarity
          });
        }
      } catch (err) {
        sendLog(socket, "OpenAI Vision failed", "error");
      }
    }

    res.json({ matches });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Error finding AliExpress matches" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
