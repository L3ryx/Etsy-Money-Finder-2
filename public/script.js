const socket = io()

let socketId = null

socket.on("connected", data => {

socketId = data.socketId

log("Connected to server")

})

socket.on("log", data => {

log(data.message)

})

function log(message){

const logs = document.getElementById("logs")

const line = document.createElement("div")

line.textContent = message

logs.appendChild(line)

logs.scrollTop = logs.scrollHeight

}

/* ========================= */
/* SEARCH ETSY */
/* ========================= */

async function searchEtsy(){

const keyword = document.getElementById("keyword").value
const limit = document.getElementById("limit").value || 10

log("Searching Etsy...")

const response = await fetch("/search-etsy",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
keyword,
limit
})

})

const data = await response.json()

displayEtsy(data.results)

}

/* ========================= */
/* ANALYZE IMAGE */
/* ========================= */

async function analyzeEtsyImage(imageUrl, etsyLink){

log("Analyzing Etsy image...")

const response = await fetch("/reverse-image",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
imageUrl,
limit:5
})

})

const data = await response.json()

displayMatches(imageUrl, etsyLink, data.results)

}

/* ========================= */
/* DISPLAY ETSY RESULTS */
/* ========================= */

function displayEtsy(results){

const container = document.getElementById("results")

container.innerHTML=""

results.forEach(item=>{

const div=document.createElement("div")

div.className="result"

div.innerHTML=`

<img src="${item.image}" width="150"><br>

<a href="${item.link}" target="_blank">Etsy Listing</a><br><br>

<button onclick="analyzeEtsyImage('${item.image}','${item.link}')">
Find AliExpress Match
</button>

<hr>

`

container.appendChild(div)

})

}

/* ========================= */
/* DISPLAY MATCHES */
/* ========================= */

function displayMatches(etsyImage, etsyLink, matches){

const container = document.getElementById("results")

const div=document.createElement("div")

div.className="result"

let html=`

<h3>Match Found</h3>

Etsy Product<br>

<img src="${etsyImage}" width="150"><br>

<a href="${etsyLink}" target="_blank">View Etsy Listing</a>

<br><br>

`

matches.forEach(m=>{

if(m.similarity>=70){

html+=`

AliExpress Match (${m.similarity}%)

<br>

<img src="${m.image}" width="150"><br>

<a href="${m.link}" target="_blank">
View AliExpress Product
</a>

<br><br>

`

}

})

div.innerHTML=html

container.appendChild(div)

}
