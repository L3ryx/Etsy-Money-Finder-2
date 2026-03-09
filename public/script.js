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

async function startSearch(){

const files = document.getElementById("images").files

if(!files.length){

alert("Select images")

return

}

const formData = new FormData()

for(const file of files){

formData.append("images", file)

}

formData.append("socketId", socketId)

log("Uploading images...")

const response = await fetch("/analyze",{
method:"POST",
body:formData
})

const data = await response.json()

displayResults(data.results)

}

function displayResults(results){

const container = document.getElementById("results")

container.innerHTML=""

results.forEach(item =>{

const div = document.createElement("div")

div.className="result"

let html = `<strong>${item.image}</strong><br>`

if(!item.matches.length){

html += "No AliExpress matches found"

}else{

item.matches.forEach(m =>{

html += `
<a href="${m.url}" target="_blank">
${m.url}
</a>
<br>
Similarity: ${m.similarity}%
<br><br>
`

})

}

div.innerHTML = html

container.appendChild(div)

})

}
