require("dotenv").config()

const express = require("express")
const axios = require("axios")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(express.static("public"))

/* =============================== */
/* LOG SYSTEM */
/* =============================== */

function sendLog(socket,message,type="info"){

console.log(`[${type}] ${message}`)

if(socket){
socket.emit("log",{
message,
type,
time:new Date().toISOString()
})
}

}

/* =============================== */
/* OPENAI IMAGE SIMILARITY */
/* =============================== */

async function similarity(imageA,imageB){

try{

const response = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"user",
content:[
{
type:"text",
text:"Return similarity score between 0 and 100."
},
{
type:"image_url",
image_url:{url:imageA}
},
{
type:"image_url",
image_url:{url:imageB}
}
]
}
]
},
{
headers:{
Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
"Content-Type":"application/json"
}
}
)

const text=response.data.choices[0].message.content
const match=text.match(/\d+/)

return match ? parseInt(match[0]) : 0

}catch(err){

return 0

}

}

/* =============================== */
/* ETSY SEARCH + AI MATCH */
/* =============================== */

app.post("/search-etsy",async(req,res)=>{

const {keyword,limit,socketId}=req.body
const socket=io.sockets.sockets.get(socketId)

if(!keyword){
return res.status(400).json({error:"keyword required"})
}

const maxItems=Math.min(parseInt(limit)||10,20)

try{

sendLog(socket,"Searching Etsy...")

const etsyUrl=`https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`

const scraper=await axios.get("https://api.scraperapi.com/",{

params:{
api_key:process.env.SCRAPAPI_KEY,
url:etsyUrl,
render:true
}

})

const html=scraper.data

const imageRegex=/https:\/\/i\.etsystatic\.com[^"]+/g
const linkRegex=/https:\/\/www\.etsy\.com\/listing\/\d+/g

const images=[...html.matchAll(imageRegex)].map(m=>m[0])
const links=[...html.matchAll(linkRegex)].map(m=>m[0])

const results=[]

for(let i=0;i<Math.min(maxItems,images.length);i++){

const etsyImage=images[i]
const etsyLink=links[i] || etsyUrl

sendLog(socket,"Reverse searching image...")

/* =========================== */
/* GOOGLE REVERSE SEARCH */
/* =========================== */

let aliImages=[]

try{

const serp=await axios.post(
"https://google.serper.dev/images",
{
q:"site:aliexpress.com",
image_url:etsyImage,
num:5
},
{
headers:{
"X-API-KEY":process.env.SERPER_API_KEY
}
}
)

aliImages=(serp.data.images || []).slice(0,5)

}catch(err){

continue

}

/* =========================== */
/* AI COMPARISON */
/* =========================== */

for(const ali of aliImages){

const aliImage=ali.thumbnail || ali.link

sendLog(socket,"Comparing images...")

const score=await similarity(etsyImage,aliImage)

if(score>=70){

results.push({

etsyImage,
etsyLink,

aliImage,
aliLink:ali.link,

similarity:score

})

break

}

}

}

/* =========================== */

res.json({results})

}catch(err){

console.error(err)

res.status(500).json({error:"search failed"})

}

})

/* =============================== */
/* SOCKET */
/* =============================== */

io.on("connection",(socket)=>{

socket.emit("connected",{socketId:socket.id})

console.log("client connected")

})

/* =============================== */

server.listen(process.env.PORT||3000,()=>{

console.log("Server running")

})
