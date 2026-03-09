// server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// =====================================================
// ROUTE TEST
// =====================================================
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// =====================================================
// ROUTE SEARCH ETSY + REVERSE IMAGE + ALIEXPRESS
// =====================================================
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit, socketId } = req.body;
  try {
    // 1️⃣ Recherche Etsy (mock ou API)
    const etsyResults = await searchEtsy(keyword, limit);

    // 2️⃣ Parallélisation avec Promise.all
    const finalResults = await Promise.all(
      etsyResults.map(async (etsyItem, index) => {
        // 🔹 Reverse image Google (mock pour test)
        const reverseImageUrl = await reverseImageGoogle(etsyItem.image);

        // 🔹 Recherche AliExpress filtrée
        const aliexpressResults = await searchAliExpress(reverseImageUrl);

        // 🔹 Emission progress via socket
        if (socketId) {
          const percent = Math.floor(((index + 1) / etsyResults.length) * 100);
          io.to(socketId).emit("progress", { percent });
        }

        return {
          etsy: {
            image: etsyItem.image,
            link: etsyItem.link,
            title: etsyItem.title,
          },
          aliexpress: aliexpressResults.slice(0, 5).map(item => ({
            image: item.image,
            link: item.link,
            title: item.title,
          })),
        };
      })
    );

    res.json({ results: finalResults });
  } catch (error) {
    console.error("Search Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// MOCK FUNCTIONS
// =====================================================
async function searchEtsy(keyword, limit = 5) {
  // Ici tu peux remplacer par ton vrai appel API Etsy
  // Mock pour test :
  const results = [];
  for (let i = 1; i <= limit; i++) {
    results.push({
      title: `${keyword} Product ${i}`,
      image: `https://picsum.photos/400/400?random=${i}`,
      link: `https://etsy.com/product/${i}`,
    });
  }
  return results;
}

async function reverseImageGoogle(imageUrl) {
  // Ici tu peux remplacer par vrai reverse image Google
  // Mock : retourne directement l'image pour test
  return imageUrl;
}

async function searchAliExpress(imageUrl) {
  // Ici tu peux utiliser ScraperAPI ou AliExpress API
  // Mock pour test
  const results = [];
  for (let i = 1; i <= 5; i++) {
    results.push({
      title: `AliExpress Match ${i}`,
      image: `https://picsum.photos/400/400?random=${i + 100}`,
      link: `https://aliexpress.com/item/${i}`,
    });
  }
  return results;
}

// =====================================================
// SOCKET.IO
// =====================================================
io.on("connection", (socket) => {
  console.log("🟢 Client connected");
  socket.emit("connected", { id: socket.id });
});

// =====================================================
// SERVER
// =====================================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
