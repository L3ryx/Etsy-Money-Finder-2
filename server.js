require("dotenv").config();
import express from "express";
import multer from "multer";
import axios from "axios";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ================= MIDDLEWARE ================= */
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* ================= SOCKET LOG ================= */
function sendLog(socket, message){
    console.log(message);
    if(socket){
        socket.emit("log", { message, time: new Date().toISOString() });
    }
}

/* ================= ETSY SEARCH ================= */
app.post("/search-etsy", async (req, res)=>{
    const { keyword, limit, socketId } = req.body;
    const socket = io.sockets.sockets.get(socketId);

    if(!keyword) return res.status(400).json({error:"Keyword required"});
    const maxItems = Math.min(parseInt(limit)||10, 50);

    try{
        sendLog(socket, `Recherche Etsy pour "${keyword}"`);
        const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;

        const scraperRes = await axios.get("https://api.scraperapi.com/",{
            params:{ api_key: process.env.SCRAPAPI_KEY, url: etsyUrl, render:true }
        });

        const html = scraperRes.data;
        const images = [...html.matchAll(/https:\/\/i\.etsystatic\.com[^"]+/g)].map(m=>m[0]);
        const links  = [...html.matchAll(/https:\/\/www\.etsy\.com\/listing\/\d+/g)].map(m=>m[0]);
        const results = [];

        for(let i=0;i<Math.min(maxItems, images.length);i++){
            const imageUrl = images[i];
            const link = links[i] || etsyUrl;

            /* ================= UPLOAD IMGBB ================= */
            let imgbbUrl = imageUrl; // fallback
            try{
                const base64 = (await axios.get(imageUrl, { responseType:"arraybuffer" })).data.toString("base64");
                const uploadRes = await axios.post("https://api.imgbb.com/1/upload",
                    new URLSearchParams({ key: process.env.IMGBB_KEY, image: base64 })
                );
                imgbbUrl = uploadRes.data.data.url;
                sendLog(socket, `Image Etsy ${i+1} uploadée sur IMGBB`);
            }catch(err){
                sendLog(socket, "IMGBB upload failed, fallback to original");
            }

            /* ================= REVERSE IMAGE -> ALIEXPRESS ================= */
            let aliResults = [];
            try{
                const reverseRes = await axios.get("https://api.scraperapi.com/",{
                    params:{
                        api_key: process.env.SCRAPAPI_KEY,
                        url:`https://www.google.com/searchbyimage?&image_url=${encodeURIComponent(imgbbUrl)}`,
                        render:true
                    }
                });
                const htmlAli = reverseRes.data;
                const aliImgs = [...htmlAli.matchAll(/https:\/\/ae01\.alicdn\.com\/[^"]+/g)].slice(0,5).map(m=>m[0]);
                const aliLinks = [...htmlAli.matchAll(/https:\/\/www\.aliexpress\.com\/item\/\d+/g)].slice(0,5).map(m=>m[0]);
                for(let j=0;j<aliImgs.length;j++){
                    aliResults.push({ image: aliImgs[j], link: aliLinks[j] || "#" });
                }
                sendLog(socket, `Reverse image terminé pour Etsy #${i+1}`);
            }catch(err){
                sendLog(socket, "Reverse image AliExpress failed");
            }

            results.push({ image: imageUrl, link, aliexpress: aliResults });
            socket?.emit("progress",{ percent: Math.round((i+1)/maxItems*100) });
        }

        res.json({ results });

    }catch(err){
        console.error(err);
        res.status(500).json({ error:"Scraping failed" });
    }
});

/* ================= SOCKET ================= */
io.on("connection", socket=>{
    console.log("🟢 Client connecté");
    socket.emit("connected",{ socketId: socket.id });
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 10000;
server.listen(PORT, ()=>console.log("🚀 Server running on port", PORT));
