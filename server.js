// server.js
import 'dotenv/config';
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import http from "http";
import axios from "axios";
import FormData from "form-data";
import cheerio from "cheerio";

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

// Upload image to ImgBB
async function uploadToImgBB(imageUrl) {
    try {
        const form = new FormData();
        form.append("image", imageUrl);
        form.append("key", process.env.IMGBB_API_KEY);
        const resp = await axios.post("https://api.imgbb.com/1/upload", form, {
            headers: form.getHeaders()
        });
        return resp.data.data.url;
    } catch (err) {
        console.error("ImgBB upload failed:", err.message);
        return null;
    }
}

// Call OpenAI for similarity
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

// 1️⃣ Recherche Etsy
app.post("/search-etsy", async (req, res) => {
    const { keyword, limit = 10 } = req.body;
    try {
        const apiUrl = `http://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent(`https://www.etsy.com/search?q=${keyword}`)}`;
        const resp = await axios.get(apiUrl);
        const $ = cheerio.load(resp.data);

        const results = [];
        $("li[data-search-result]").each((i, el) => {
            if (i >= limit) return false;
            const img = $(el).find("img").attr("src");
            const link = $(el).find("a").attr("href");
            if (img && link) results.push({ etsyImage: img, etsyLink: link });
        });
        res.json({ results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to search Etsy" });
    }
});

// 2️⃣ Recherche inversée + AliExpress + OpenAI
app.post("/find-aliexpress", async (req, res) => {
    const { etsyImage, etsyLink, socketId } = req.body;
    const socket = io.sockets.sockets.get(socketId);
    const results = [];

    try {
        // Upload Etsy image sur imgbb
        const imgbbUrl = await uploadToImgBB(etsyImage);
        if (!imgbbUrl) return res.status(500).json({ error: "Failed to upload Etsy image" });

        sendLog(socket, `Uploaded Etsy image to ImgBB: ${imgbbUrl}`);

        // Recherche inversée Google via Serper
        const serperResp = await axios.get(`https://api.serper.dev/search?image_url=${encodeURIComponent(imgbbUrl)}&filter=aliexpress`, {
            headers: { "X-API-KEY": process.env.SERPER_API_KEY }
        });

        // Récupérer 5 premières images + liens
        const aliResults = serperResp.data.results.slice(0, 5).map(r => ({
            aliImage: r.thumbnail || r.image,
            aliLink: r.link
        }));

        // Comparaison OpenAI
        for (const item of aliResults) {
            const similarity = await callOpenAIWithRetry(item.aliImage, 3, socket);
            if (similarity >= 60) {
                results.push({
                    etsyImage,
                    etsyLink,
                    aliImage: item.aliImage,
                    aliLink: item.aliLink,
                    similarity
                });
                break; // Arrêter dès qu'une image est similaire ≥ 60%
            }
            await delay(500);
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
