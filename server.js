// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { Server } from "socket.io";
import http from "http";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static("public")); // pour servir index.html et script.js

const PORT = process.env.PORT || 10000;

function sendLog(socket, message, type = "info") {
  if (socket) socket.emit("log", { message, type });
  console.log(`[${type}] ${message}`);
}

// Route pour tester la connexion Socket
io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });
  sendLog(socket, `Socket connected: ${socket.id}`, "info");
});

// ============================
// Recherche Etsy
// ============================
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  const results = [];

  try {
    // Remplace cette partie par ton vrai appel Etsy
    // Exemple mock :
    for (let i = 1; i <= limit; i++) {
      results.push({
        etsyImage: `https://placekitten.com/200/20${i}`,
        etsyLink: `https://etsy.com/item/${i}`
      });
    }
    res.json({ results });
  } catch (err) {
    console.error("Etsy search failed:", err);
    res.status(500).json({ error: "Etsy search failed" });
  }
});

// ============================
// Recherche AliExpress + Similarité
// ============================
app.post("/find-aliexpress", async (req, res) => {
  const { etsyImage, socketId } = req.body;
  const socket = io.sockets.sockets.get(socketId);
  const results = [];

  try {
    sendLog(socket, `Finding AliExpress matches for ${etsyImage}`);

    // -------------------------------
    // 1. Récupère les 5 premiers résultats AliExpress
    // -------------------------------
    const aliResults = [];
    for (let i = 1; i <= 5; i++) {
      aliResults.push({
        aliImage: `https://placekitten.com/100/10${i}`, // mock image
        aliLink: `https://aliexpress.com/item/${i}`
      });
    }

    // -------------------------------
    // 2. Analyse de similarité OpenAI Vision
    // -------------------------------
    const matches = [];
    for (const ali of aliResults) {
      try {
        const vision = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Return similarity score between 0 and 100." },
                  { type: "image_url", image_url: { url: etsyImage } },
                  { type: "image_url", image_url: { url: ali.aliImage } }
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

        const text = vision.data.choices[0].message.content;
        const match = text.match(/\d+/);
        const similarity = match ? parseInt(match[0]) : 0;

        sendLog(socket, `Similarity Etsy ↔ AliExpress: ${similarity}%`);

        if (similarity >= 70) {
          matches.push({
            aliImage: ali.aliImage,
            aliLink: ali.aliLink,
            similarity
          });
        }
      } catch (err) {
        sendLog(socket, `OpenAI Vision failed for ${ali.aliImage}`, "error");
        console.error(err);
      }
    }

    res.json({ matches });
  } catch (err) {
    sendLog(socket, "Error finding AliExpress matches", "error");
    console.error(err);
    res.status(500).json({ error: "AliExpress search failed" });
  }
});

// ============================
// Démarrage du serveur
// ============================
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
