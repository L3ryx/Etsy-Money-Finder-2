// script.js

const socket = io();

// ==========================
// LOGS SOCKET
// ==========================
socket.on("log", (data) => {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `[${data.time}] ${data.message}<br>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
});

socket.on("connected", (data) => {
  console.log("Connected to server, socketId:", data.socketId);
  window.socketId = data.socketId;
});

// ==========================
// SEARCH ETSY + ANALYSE
// ==========================
async function search() {
  const keyword = document.getElementById("keyword").value.trim();
  const limit = document.getElementById("limit").value || 10;

  if (!keyword) return alert("Please enter a keyword");

  document.getElementById("results").innerHTML = "";
  document.getElementById("logs").innerHTML = "";

  console.log("Starting Etsy search for:", keyword);

  try {
    // 1️⃣ Requête vers le serveur pour chercher Etsy
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const data = await res.json();
    const etsyItems = data.results;

    if (!etsyItems.length) {
      alert("No Etsy items found");
      return;
    }

    // 2️⃣ Affiche les images Etsy
    displayEtsyResults(etsyItems);

    // 3️⃣ Prépare les images pour analyse
    const formData = new FormData();
    formData.append("socketId", window.socketId);

    for (const item of etsyItems) {
      const imageResp = await fetch(item.image);
      const blob = await imageResp.blob();
      formData.append("images", new File([blob], "image.jpg"));
    }

    // 4️⃣ Envoi au serveur pour analyse
    console.log("Starting image analysis...");
    const analyzeRes = await fetch("/analyze-images", {
      method: "POST",
      body: formData
    });
    const analyzeData = await analyzeRes.json();

    // 5️⃣ Affiche les résultats AliExpress
    displayAliResults(analyzeData.results);

  } catch (err) {
    console.error(err);
    alert("Error during search. Check console.");
  }
}

// ==========================
// DISPLAY ETSY
// ==========================
function displayEtsyResults(items) {
  const resultsDiv = document.getElementById("results");
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div>
        <a href="${item.link}" target="_blank">
          <img src="${item.image}" alt="Etsy">
        </a>
      </div>
      <div class="ali-results"></div>
    `;
    resultsDiv.appendChild(card);
  });
}

// ==========================
// DISPLAY ALIEXPRESS
// ==========================
function displayAliResults(analyzeResults) {
  const resultCards = document.querySelectorAll(".result-card");
  analyzeResults.forEach((item, idx) => {
    const aliDiv = resultCards[idx].querySelector(".ali-results");
    item.matches.forEach(match => {
      const matchEl = document.createElement("div");
      matchEl.style.marginTop = "10px";
      matchEl.innerHTML = `
        <a href="${match.url}" target="_blank">
          <img src="${match.image}" style="width:100px; border-radius:6px;">
          <p style="margin:0; font-size:12px;">Similarity: ${match.similarity}%</p>
        </a>
      `;
      aliDiv.appendChild(matchEl);
    });
  });
}
