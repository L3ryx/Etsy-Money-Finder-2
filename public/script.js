const socket = io();
let socketId = null;

socket.on("connected", data => {
  socketId = data.socketId;
  log("✅ Connected to server");
});

socket.on("log", data => {
  log(data.message);
});

function log(message) {
  const logs = document.getElementById("logs");
  logs.innerHTML += message + "<br>";
  logs.scrollTop = logs.scrollHeight;
}

async function search() {
  const keyword = document.getElementById("keyword").value.trim();
  const limit = document.getElementById("limit").value || 10;
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  if (!keyword) {
    alert("Please enter a keyword");
    return;
  }

  log(`🔎 Searching Etsy for "${keyword}"...`);

  try {
    // 1️⃣ Recherche Etsy
    const etsyRes = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const etsyData = await etsyRes.json();

    if (!etsyData.results || etsyData.results.length === 0) {
      log("❌ No Etsy results found");
      return;
    }

    log(`✅ Found ${etsyData.results.length} Etsy items`);

    // 2️⃣ Analyse et comparaison avec AliExpress
    const analyzeRes = await fetch("/analyze-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etsyResults: etsyData.results, socketId })
    });

    const analyzeData = await analyzeRes.json();

    if (!analyzeData.results || analyzeData.results.length === 0) {
      log("❌ No results with similarity ≥ 40%");
      return;
    }

    log(`✅ ${analyzeData.results.length} matching results found`);

    // 3️⃣ Affichage
    for (const item of analyzeData.results) {
      const div = document.createElement("div");
      div.classList.add("result");

      div.innerHTML = `
        <h3>Etsy → AliExpress</h3>
        <div style="display:flex;gap:20px;align-items:center;">
          <div>
            <a href="${item.etsyLink}" target="_blank">
              <img src="${item.etsyImage}" />
            </a>
            <p>Etsy</p>
          </div>
          <div>
            <a href="${item.aliLink}" target="_blank">
              <img src="${item.aliImage}" />
            </a>
            <p>AliExpress - Similarity: ${item.similarity}%</p>
          </div>
        </div>
      `;

      resultsDiv.appendChild(div);
    }

  } catch (err) {
    console.error(err);
    log("❌ Error during search");
  }
}
