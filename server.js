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

/* SOCKET LOG SYSTEM */
function sendLog(socket, message) {
  console.log(message);
  if (socket) {
    socket.emit("log", { message, time: new Date().toISOString() });
  }
}

/* ETSY SEARCH */
app.post("/search-etsy", async (req, res) => {
  const { keyword, limit } = req.body;
  const maxItems = Math.min(parseInt(limit) || 10, 50);
  try {
    const etsyUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
    const scraperRes = await axios.get("https://api.scraperapi.com/", {
      params: {
        api_key: process.env.SCRAPAPI_KEY,
        url: etsyUrl,
        render: true
      }
    });
    const html = scraperRes.data;
    const imageRegex = /https:\/\/i\.etsystatic\.com[^"]+/g;
    const linkRegex = /https:\/\/www\.etsy\.com\/listing\/\d+/g;
    const images = [...html.matchAll(imageRegex)].map(m => m[0]);
    const links = [...html.matchAll(linkRegex)].map(m => m[0]);
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

/* CONVERT IMAGE URL TO BASE64 */
async function urlToBase64(url) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(response.data, "binary").toString("base64");
}

/* REVERSE IMAGE SEARCH + OPENAI SIMILARITY */
app.post("/analyze-etsy", async (req, res) => {
  const { etsyResults } = req.body; // array of {image, link}
  const finalResults = [];

  for (const etsyItem of etsyResults) {
    try {
      sendLog(null, `🔎 Searching AliExpress for Etsy image`);

      // Convert Etsy image to base64
      const etsyBase64 = await urlToBase64(etsyItem.image);

      // Search AliExpress images via Serper
      const serpRes = await axios.post(
        "https://google.serper.dev/images",
        {
          q: "site:aliexpress.com",
          image_url: etsyItem.image,
          num: 5
        },
        { headers: { "X-API-KEY": process.env.SERPER_API_KEY } }
      );

      const aliResults = (serpRes.data?.images || []).slice(0, 5);

      const matchedResults = [];

      for (const aliItem of aliResults) {
        try {
          // Convert AliExpress image to base64
          const aliBase64 = await urlToBase64(aliItem.thumbnail || aliItem.link);

          // Call OpenAI Vision to get similarity
          const visionRes = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Return similarity score between 0 and 100." },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${etsyBase64}` } },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${aliBase64}` } }
                  ]
                }
              ]
            },
            { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
          );

          const text = visionRes.data.choices[0].message.content;
          const score = text.match(/\d+/) ? parseInt(text.match(/\d+/)[0]) : 0;
          console.log("Similarity score:", score);

          if (score >= 40) {
            matchedResults.push({
              etsyImage: etsyItem.image,
              etsyLink: etsyItem.link,
              aliImage: aliItem.thumbnail || aliItem.link,
              aliLink: aliItem.link,
              similarity: score
            });
          }
        } catch (err) {
          sendLog(null, "OpenAI Vision error");
        }
      }

      if (matchedResults.length) {
        finalResults.push(...matchedResults);
      }
    } catch (err) {
      sendLog(null, "Error processing Etsy item");
    }
  }

  res.json({ results: finalResults });
});

/* SOCKET CONNECTION */
io.on("connection", socket => {
  socket.emit("connected", { socketId: socket.id });
  console.log("🟢 Client connected");
});

/* SERVER START */
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("🚀 Server running on port", PORT));
