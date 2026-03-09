// server.js
import 'dotenv/config';
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import http from "http";
import axios from "axios";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ========================
// WebSocket
// ========================
io.on("connection", socket => {
    console.log("Socket connected:", socket.id);
    socket.emit("connected", { socketId: socket.id });
});

// ========================
// Utils
// ========================
function sendLog(socket, message) {
    console.log(message);
    if (socket) socket.emit("log", { type: "info", message });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function callOpenAIWithRetry(imageUrl, retries = 3, socket = null) {
    for (let i = 0; i < retries; i++) {
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
                                { type: "image_url", image_url: { url: imageUrl } }
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
            sendLog(socket, `AI Similarity: ${similarity}% for ${imageUrl}`);
            return similarity;
        } catch (err) {
            if (err.response?.status === 429) {
                sendLog(socket, `Rate limited by OpenAI, retrying in 2s for ${imageUrl}`);
                await delay(2000);
            } else {
                sendLog(socket, `OpenAI Vision failed for ${imageUrl}`);
                return 0;
            }
        }
    }
    sendLog(socket, `OpenAI Vision failed after retries for ${imageUrl}`);
    return 0;
}

// ========================
// Routes
// ========================

// Recherche Etsy
app.post("/search-etsy", async (req, res) => {
    const { keyword, limit = 5 } = req.body;
    try {
        // Simulation: ici tu appellerais l'API Etsy
        const results = [];
        for (let i = 1; i <= limit; i++) {
            results.push({
                etsyImage: `https://placekitten.com/200/${200 + i}`, 
                etsyLink: `https://etsy.com/item/${keyword}-${i}`
            });
        }
        res.json({ results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to search Etsy" });
    }
});

// Recherche Aliexpress avec AI Similarity
app.post("/find-aliexpress", async (req, res) => {
    const { etsyImage, socketId } = req.body;
    const socket = io.sockets.sockets.get(socketId);
    const results = [];

    try {
        // Simulation: ici tu appellerais l'API Aliexpress
        const aliImages = [];
        for (let i = 0; i < 5; i++) {
            aliImages.push({
                aliImage: `https://placekitten.com/100/${100 + i}`,
                aliLink: `https://aliexpress.com/item/${i}`
            });
        }

        // Analyse de similarité OpenAI avec throttling
        for (const item of aliImages) {
            const similarity = await callOpenAIWithRetry(item.aliImage, 3, socket);
            results.push({
                aliImage: item.aliImage,
                aliLink: item.aliLink,
                similarity
            });
            await delay(500); // 0.5s entre chaque requête pour éviter le 429
        }

        res.json({ matches: results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to find AliExpress matches" });
    }
});

// ========================
// Server
// ========================
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
