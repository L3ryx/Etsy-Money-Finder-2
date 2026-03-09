const socket = io();

// Connexion socket
let SOCKET_ID = null;
socket.on("connected", data => {
  SOCKET_ID = data.socketId;
  addLog(`🟢 Connected with socket ID: ${SOCKET_ID}`);
});

// Fonction pour ajouter un log au div #logs
function addLog(message) {
  const logs = document.getElementById("logs");
  const p = document.createElement("p");
  p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logs.appendChild(p);
  logs.scrollTop = logs.scrollHeight;
}

// Réception des logs du serveur
socket.on("log", data => {
  addLog(data.message);
});

// ----------------------------
// RECHERCHE ETSY
// ----------------------------
async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;

  if (!keyword) return addLog("❌ Enter a keyword first");

  addLog(`🔎 Searching Etsy for "${keyword}"...`);

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });

    const data = await res.json();

    if (data.error) {
      addLog(`❌ Etsy search failed: ${data.error}`);
      return;
    }

    addLog(`✅ Etsy search found ${data.results.length} items`);

    // Affiche les images Etsy
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = ""; // reset

    for (const item of data.results) {
      const card = document.createElement("div");
      card.className = "result-card";

      const etsyDiv = document.createElement("div");
      etsyDiv.innerHTML = `<a href="${item.link}" target="_blank"><img src="${item.image}" alt="Etsy"></a>`;

      const aliDiv = document.createElement("div");
      aliDiv.innerHTML = `<p>Searching AliExpress...</p>`;

      card.appendChild(etsyDiv);
      card.appendChild(aliDiv);
      resultsDiv.appendChild(card);

      // Appel analyse image serveur
      analyzeImage(item.image, aliDiv);
    }
  } catch (err) {
    addLog(`❌ Etsy request error: ${err.message}`);
  }
}

// ----------------------------
// ANALYSE IMAGE (UPLOAD + ALIEXPRESS + OpenAI)
// ----------------------------
async function analyzeImage(imageUrl, aliDiv) {
  addLog(`⏳ Starting image analysis for ${imageUrl}`);

  try {
    const formData = new FormData();
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    formData.append("images", blob, "etsy.jpg");
    formData.append("socketId", SOCKET_ID);

    const res = await fetch("/analyze-images", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    const matches = data.results[0]?.matches || [];

    if (matches.length === 0) {
      aliDiv.innerHTML = "<p>No AliExpress match found</p>";
      addLog("⚠ No match found for this Etsy image");
      return;
    }

    aliDiv.innerHTML = ""; // clear "searching..."
    for (const match of matches) {
      const a = document.createElement("a");
      a.href = match.url;
      a.target = "_blank";
      a.innerHTML = `<img src="${match.image}" alt="AliExpress" style="width:120px; margin:5px; border-radius:6px;"> <p>Similarity: ${match.similarity}%</p>`;
      aliDiv.appendChild(a);
    }

    addLog(`✅ AliExpress matches displayed (${matches.length})`);
  } catch (err) {
    addLog(`❌ Image analysis error: ${err.message}`);
  }
}
