const socket = io();
let socketId = null;

socket.on("connected", data => {
  socketId = data.socketId;
  addLog("Connected with socket: " + socketId);
});

socket.on("log", data => {
  addLog(`[${data.time}] ${data.message}`);
});

function addLog(msg) {
  const logs = document.getElementById("logs");
  const p = document.createElement("p");
  p.textContent = msg;
  logs.appendChild(p);
  logs.scrollTop = logs.scrollHeight;
}

async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value || 10;

  addLog("Starting Etsy search...");
  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const data = await res.json();
    displayEtsyResults(data.results);
  } catch (err) {
    addLog("Etsy search failed");
  }
}

function displayEtsyResults(results) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  results.forEach(item => {
    const div = document.createElement("div");
    div.className = "result-card";
    div.innerHTML = `
      <div>
        <img src="${item.image}" />
        <p><a href="${item.link}" target="_blank">Etsy Link</a></p>
      </div>
      <div>
        <button onclick="analyzeImage('${item.image}')">Analyze</button>
        <div class="ali-results" id="ali-${btoa(item.image)}"></div>
      </div>
    `;
    container.appendChild(div);
  });
}

async function analyzeImage(imageUrl) {
  addLog("Starting image analysis for " + imageUrl);
  try {
    const res = await fetch("/analyze-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ socketId, images: [imageUrl] })
    });
    const data = await res.json();
    displayAliResults(data.results);
  } catch {
    addLog("Image analysis failed");
  }
}

function displayAliResults(results) {
  results.forEach(r => {
    const div = document.getElementById("ali-" + btoa(r.image));
    if (!div) return;
    div.innerHTML = "";
    r.matches.forEach(m => {
      div.innerHTML += `
        <div class="result-card">
          <img src="${m.image}" />
          <p><a href="${m.url}" target="_blank">AliExpress Link</a></p>
          <p>Similarity: ${m.similarity}%</p>
        </div>
      `;
    });
  });
}
