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
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sendLog(socket, message) {
    console.log(message);
    if (socket) socket.emit("log", { type: "info", message });
}

// Upload image sur imgbb
async function uploadToImgbb(imageUrl) {
    try {
        const form = new FormData();
        form.append("image", imageUrl);
        const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_KEY}`, form, {
            headers: form.getHeaders()
        });
        return resp.data.data.url;
    } catch (err) {
        console.error("Erreur imgbb:", err.message);
        return imageUrl; // fallback si échec
    }
}

// Appel OpenAI pour comparer deux images
async function compareImagesOpenAI(imageUrl1, imageUrl2, socket = null) {
    try {
        const resp = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Compare these two images and return similarity score 0-100." },
                            { type: "image_url", image_url: { url: imageUrl1 } },
                            { type: "image_url", image_url: { url: imageUrl2 } }
                        ]
                    }
                ]
            },
            { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
        );
        const text = resp.data.choices[0].message.content;
        const match = text.match(/\d+/);
        const similarity = match ? parseInt(match[0]) : 0;
        sendLog(socket, `AI similarity ${similarity}%`);
        return similarity;
    } catch (err) {
        sendLog(socket, `OpenAI error for images`);
        return 0;
    }
}

// ========================
// Routes
// ========================

// 1️⃣ Recherche Etsy
app.post("/search-etsy", async (req, res) => {
    const { keyword } = req.body;
    try {
        const etsyResp = await axios.get(`https://api.scraperapi.com/?api_key=${process.env.SCRAPERAPI_KEY}&url=https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`);
        const $ = cheerio.load(etsyResp.data);
        const results = [];
        $("li.wt-list-unstyled").slice(0, 10).each((i, el) => {
            const link = $(el).find("a").attr("href");
            const img = $(el).find("img").attr("src");
            if (link && img) results.push({ etsyLink: link, etsyImage: img });
        });
        res.json({ results });
    } catch (err) {
        console.error("Etsy search error:", err.message);
        res.status(500).json({ error: "Failed to search Etsy" });
    }
});

// 2️⃣ Recherche Aliexpress + comparaison OpenAI
app.post("/find-aliexpress", async (req, res) => {
    const { etsyImage, socketId } = req.body;
    const socket = io.sockets.sockets.get(socketId);
    const results = [];

    try {
        const etsyImagePublic = await uploadToImgbb(etsyImage);

        // Recherche Google inversé via Serper
        const serperResp = await axios.get(`https://google.serper.dev/search?image_url=${encodeURIComponent(etsyImagePublic)}&aliexpress=true`, {
            headers: { "X-API-KEY": process.env.SERPER_KEY }
        });

        const aliResults = serperResp.data.items.slice(0, 5); // 5 premiers résultats
        for (const item of aliResults) {
            const similarity = await compareImagesOpenAI(etsyImagePublic, item.image, socket);
            results.push({
                aliImage: item.image,
                aliLink: item.link,
                similarity
            });
            if (similarity >= 60) break; // Stop dès que threshold atteint
            await delay(500);
        }

        res.json({ matches: results });
    } catch (err) {
        console.error("Aliexpress search error:", err.message);
        res.status(500).json({ error: "Failed to find AliExpress matches" });
    }
});

// ========================
// Server
// ========================
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
