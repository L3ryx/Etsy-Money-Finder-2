const socket = io();

let socketId = null;
socket.on("connected", data => { socketId = data.socketId; log("Socket connected: " + socketId); });
socket.on("log", data => log(data.message));

function log(msg) {
  const logs = document.getElementById("logs");
  logs.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}<br>`;
  logs.scrollTop = logs.scrollHeight;
}

async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;

  if (!keyword) return alert("Enter keyword");

  log("Searching Etsy...");
  const res = await fetch("/search-etsy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, limit })
  });
  const data = await res.json();

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  for (const item of data.results) {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div>
        <img src="${item.etsyImage}" />
        <a href="${item.etsyLink}" target="_blank">Etsy Link</a>
      </div>
      <div id="ali-${item.etsyLink.replace(/\W/g,'')}">Searching AliExpress...</div>
    `;
    resultsDiv.appendChild(card);

    // Send image for analysis
    const blob = await fetch(item.etsyImage).then(r => r.blob());
    const form = new FormData();
    form.append("socketId", socketId);
    form.append("images", blob, item.etsyLink);

    const analyzeRes = await fetch("/analyze-images", { method: "POST", body: form });
    const analyzeData = await analyzeRes.json();
    const matchDiv = document.getElementById(`ali-${item.etsyLink.replace(/\W/g,'')}`);
    const match = analyzeData.results[0]?.aliMatch;
    if (match) {
      matchDiv.innerHTML = `<img src="${match.aliImage}" width="120"/><br><a href="${match.aliLink}" target="_blank">AliExpress Link</a><br>Similarity: ${match.similarity}%`;
    } else {
      matchDiv.innerHTML = "No match found";
    }
  }
}
