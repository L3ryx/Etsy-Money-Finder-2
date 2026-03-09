// script.js

const socket = io(); // se connecte automatiquement au serveur
const logsDiv = document.getElementById("logs");
const resultsDiv = document.getElementById("results");

// Fonction pour afficher les logs
function log(message) {
  const time = new Date().toLocaleTimeString();
  logsDiv.innerHTML += `[${time}] ${message}<br>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

// Socket logs
socket.on("connected", ({ socketId }) => {
  log(`🔌 Connected with socket ID: ${socketId}`);
});

socket.on("log", (data) => {
  log(`📝 ${data.message}`);
});

// Bouton search
async function search() {
  resultsDiv.innerHTML = "";
  const keyword = document.getElementById("keyword").value;
  const limit = parseInt(document.getElementById("limit").value) || 10;

  if (!keyword) {
    log("⚠️ Please enter a keyword");
    return;
  }

  log(`🔎 Starting Etsy search for "${keyword}" (limit: ${limit})`);

  try {
    const response = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();

    log(`✅ Etsy search returned ${data.results.length} results`);

    // Affiche les résultats Etsy
    for (const item of data.results) {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <div>
          <img src="${item.image}" alt="Etsy Image">
        </div>
        <div>
          <a href="${item.link}" target="_blank" style="color:#22c55e;">Etsy Link</a>
          <div id="ali-${btoa(item.link)}">Searching AliExpress...</div>
        </div>
      `;
      resultsDiv.appendChild(card);

      // Lancer l'analyse image + recherche AliExpress
      analyzeImage(item.image, item.link);
    }

  } catch (err) {
    log(`❌ Etsy search error: ${err.message}`);
  }
}

// Analyse image + recherche AliExpress
async function analyzeImage(imageUrl, etsyLink) {
  log(`🖼️ Starting image analysis for Etsy image: ${etsyLink}`);

  try {
    const formData = new FormData();
    formData.append("socketId", socket.id);

    // On envoie l'image URL directement (le serveur fera upload + analyse)
    formData.append("images", imageUrl);

    const response = await fetch("/analyze-images", {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();
    log(`📊 Image analysis completed for ${etsyLink}`);

    // Affiche les résultats AliExpress
    const aliDiv = document.getElementById(`ali-${btoa(etsyLink)}`);
    aliDiv.innerHTML = ""; // reset

    if (data.results.length === 0 || data.results[0].matches.length === 0) {
      aliDiv.innerHTML = "No similar AliExpress results found";
      log(`⚠️ No AliExpress matches for ${etsyLink}`);
      return;
    }

    const matches = data.results[0].matches;
    for (const m of matches) {
      const matchCard = document.createElement("div");
      matchCard.style.marginTop = "5px";
      matchCard.innerHTML = `
        <img src="${m.image}" width="80" style="border-radius:4px;">
        <a href="${m.url}" target="_blank" style="color:#22c55e;">AliExpress Link (Similarity: ${m.similarity}%)</a>
      `;
      aliDiv.appendChild(matchCard);
    }

  } catch (err) {
    log(`❌ Image analysis error: ${err.message}`);
  }
}
