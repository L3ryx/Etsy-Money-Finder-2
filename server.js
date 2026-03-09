// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Fonction pour calculer la similarité via OpenAI GPT-4o-mini
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
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64B}` } },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const text = response.data.choices[0].message.content;
    const match = text.match(/0\.\d+|1(\.0+)?/);
    return match ? parseFloat(match[0]) : 0;
  } catch (error) {
    console.error("OpenAI Vision error", error.response?.data || error.message);
    return 0;
  }
}

// Exemple de fonction pour rechercher sur AliExpress (mock, à adapter)
async function searchAliExpress(base64Image) {
  // Ici tu pourrais uploader sur un service ou utiliser un moteur d’images
  return [
    {
      title: "Produit similaire 1",
      price: "$10",
      image: base64Image, // renvoie base64 pour le client
      url: "https://www.aliexpress.com/item/123",
    },
  ];
}

// Socket.io connection
io.on("connection", (socket) => {
  console.log("🟢 Client connected");

  socket.on("search-etsy-image", async ({ etsyImageBase64 }) => {
    try {
      console.log("🔎 Processing Etsy image");

      // 1. Recherche AliExpress
      const aliexpressResults = await searchAliExpress(etsyImageBase64);

      // 2. Calculer similarité avec chaque résultat
      for (let result of aliexpressResults) {
        result.similarity = await calculateSimilarity(etsyImageBase64, result.image);
      }

      // 3. Filtrer résultats pertinents (≥ 0.4)
      const filtered = aliexpressResults.filter((r) => r.similarity >= 0.4);

      socket.emit("etsy-results", filtered.length ? filtered : { message: "No results with similarity ≥ 40%" });
    } catch (error) {
      console.error("Error processing Etsy item", error);
      socket.emit("etsy-results", { error: "Error processing Etsy item" });
    }
  });
});

app.get("/", (req, res) => {
  res.send("Etsy Money Finder Server is running!");
});
