const socket = io()

let socketId = null

socket.on("connected",data=>{
socketId=data.socketId
log("Connected to server")
})

socket.on("log",data=>{
log(data.message)
})

function log(message){

const logs=document.getElementById("logs")

const line=document.createElement("div")
line.textContent=message

logs.appendChild(line)

logs.scrollTop=logs.scrollHeight

}

/* ======================= */
/* SEARCH */
/* ======================= */

async function search(){

const keyword=document.getElementById("keyword").value
const limit=document.getElementById("limit").value || 10

if(!keyword){

alert("Enter keyword")

return

}

log("Starting search...")

const response = await fetch("/search-etsy",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
keyword,
limit,
socketId
})

})

const data = await response.json()

displayResults(data.results)

}

/* ======================= */
/* DISPLAY */
/* ======================= */

function displayResults(results){

const container=document.getElementById("results")

container.innerHTML=""

results.forEach(r=>{

const div=document.createElement("div")

div.className="result"

div.innerHTML=`

<h3>Match Found (${r.similarity}%)</h3>

Etsy Product<br>
<img src="${r.etsyImage}"><br>
<a href="${r.etsyLink}" target="_blank">View Etsy</a>

<br><br>

AliExpress Product<br>
<img src="${r.aliImage}"><br>
<a href="${r.aliLink}" target="_blank">View AliExpress</a>

`

container.appendChild(div)

})

}
