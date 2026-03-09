// Connexion Socket.io
const socket = io();

// Stocke le socketId envoyé par le serveur
let socketId = null;

socket.on("connected", (data) => {
  socketId = data.socketId;
  appendLog(`🟢 Connected with socketId: ${socketId}`);
});

// Fonction pour ajouter des logs
function appendLog(message, type = "info") {
  const logsDiv = document.getElementById("logs");
  const time = new Date().toLocaleTimeString();
  const logEl = document.createElement("div");
  logEl.textContent = `[${time}] ${message}`;
  if (type === "error") logEl.style.color = "red";
  logsDiv.appendChild(logEl);
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

// Écoute les logs du serveur
socket.on("log", (data) => {
  appendLog(data.message, data.type);
});

// Rechercher sur Etsy
async function search() {
  const keyword = document.getElementById("keyword").value.trim();
  const limit = document.getElementById("limit").value || 10;

  if (!keyword) return alert("Enter a keyword");

  appendLog(`🔍 Searching Etsy for "${keyword}"`);

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });

    const data = await res.json();
    displayEtsyResults(data.results);
  } catch (err) {
    appendLog(`❌ Etsy search error: ${err.message}`, "error");
  }
}

// Affiche les résultats Etsy
function displayEtsyResults(results) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  results.forEach(item => {
    const el = document.createElement("div");
    el.className = "result";

    el.innerHTML = `
      <img src="${item.image}" alt="Etsy Image">
      <p><a href="${item.link}" target="_blank">${item.link}</a></p>
    `;

    resultsDiv.appendChild(el);
  });
}

// Upload et analyse images
async function analyzeImages() {
  const input = document.getElementById("imageFiles");
  if (!input.files.length) return alert("Select images first");

  const formData = new FormData();
  for (const file of input.files) formData.append("images", file);
  formData.append("socketId", socketId);

  appendLog("🧠 Sending images for analysis...");

  try {
    const res = await fetch("/analyze-images", { method: "POST", body: formData });
    const data = await res.json();
    displayAnalysisResults(data.results);
  } catch (err) {
    appendLog(`❌ Image analysis error: ${err.message}`, "error");
  }
}

// Affiche les résultats de l'analyse
function displayAnalysisResults(results) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  results.forEach(item => {
    const el = document.createElement("div");
    el.className = "result";

    let html = `<h3>${item.image}</h3>`;
    item.matches.forEach(match => {
      html += `
        <p>
          <a href="${match.url}" target="_blank">${match.url}</a>
          — Similarity: ${(match.similarity * 100).toFixed(1)}%
        </p>
      `;
    });

    el.innerHTML = html;
    resultsDiv.appendChild(el);
  });
}

// Connect les boutons
document.getElementById("searchBtn").addEventListener("click", search);
document.getElementById("analyzeBtn").addEventListener("click", analyzeImages);
