require("dotenv").config()

const express = require("express")
const multer = require("multer")
const axios = require("axios")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const upload = multer({
storage: multer.memoryStorage()
})

app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(express.static("public"))

/* ======================================= */
/* LOG SYSTEM */
/* ======================================= */

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

/* ======================================= */
/* ETSY SEARCH */
/* ======================================= */

app.post("/search-etsy",async(req,res)=>{

const {keyword,limit}=req.body

if(!keyword){
return res.status(400).json({error:"keyword required"})
}

const maxItems=Math.min(parseInt(limit)||10,50)

try{

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

results.push({
image:images[i],
link:links[i]||etsyUrl
})

}

res.json({results})

}catch(err){

console.error(err.message)

res.status(500).json({error:"etsy scraping failed"})

}

})

/* ======================================= */
/* OPENAI IMAGE SIMILARITY */
/* ======================================= */

async function imageSimilarity(imageA,imageB){

try{

const response=await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"user",
content:[
{
type:"text",
text:"Return similarity score between 0 and 100"
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

return match?parseInt(match[0]):0

}catch(err){

console.log("vision error")

return 0

}

}

/* ======================================= */
/* IMAGE ANALYSIS */
/* ======================================= */

app.post("/analyze-images",upload.array("images"),async(req,res)=>{

const socketId=req.body.socketId
const socket=io.sockets.sockets.get(socketId)

const finalResults=[]

for(const file of req.files){

sendLog(socket,`Processing ${file.originalname}`)

const base64=file.buffer.toString("base64")

/* ========================= */
/* UPLOAD IMGBB */
/* ========================= */

let imageUrl

try{

const uploadRes=await axios.post(
"https://api.imgbb.com/1/upload",
new URLSearchParams({
key:process.env.IMGBB_KEY,
image:base64
})
)

imageUrl=uploadRes.data.data.url

sendLog(socket,"Uploaded to IMGBB")

}catch(err){

sendLog(socket,"IMGBB upload failed","error")

continue

}

/* ========================= */
/* REVERSE IMAGE SEARCH */
/* ========================= */

let aliResults=[]

try{

const serp=await axios.post(
"https://google.serper.dev/images",
{
q:"site:aliexpress.com",
image_url:imageUrl,
num:5
},
{
headers:{
"X-API-KEY":process.env.SERPER_API_KEY
}
}
)

aliResults=(serp.data.images||[]).slice(0,5)

sendLog(socket,`${aliResults.length} AliExpress results found`)

}catch(err){

sendLog(socket,"reverse search failed","error")

}

/* ========================= */
/* COMPARE IMAGES */
/* ========================= */

const matches=[]

for(const item of aliResults){

const aliImage=item.thumbnail||item.link

sendLog(socket,"Comparing images...")

const similarity=await imageSimilarity(imageUrl,aliImage)

sendLog(socket,`Similarity ${similarity}%`)

if(similarity>=70){

matches.push({
etsyImage:imageUrl,
etsyLink:"Etsy",
aliImage,
aliLink:item.link,
similarity
})

}

}

/* ========================= */

if(matches.length){

finalResults.push({
image:file.originalname,
matches
})

}

}

/* ========================= */

res.json({results:finalResults})

})

/* ======================================= */
/* SOCKET */
/* ======================================= */

io.on("connection",(socket)=>{

socket.emit("connected",{
socketId:socket.id
})

console.log("client connected")

})

/* ======================================= */
/* START SERVER */
/* ======================================= */

server.listen(process.env.PORT||3000,()=>{

console.log("server running")

})
