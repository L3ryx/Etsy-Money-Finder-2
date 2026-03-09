const socket = io();
let socketId = null;

socket.on("connected", data => {
  socketId = data.socketId;
  log("🟢 Connected to server with socketId: " + socketId);
});

socket.on("log", data => {
  log(data.message);
});

function log(message) {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `<div>${message}</div>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

async function search() {
  const keyword = document.getElementById("keyword").value.trim();
  const limit = document.getElementById("limit").value;

  if (!keyword) return alert("Enter a keyword");

  document.getElementById("results").innerHTML = "";
  log("🔍 Searching Etsy for keyword: " + keyword);

  try {
    // 1️⃣ Search Etsy
    const etsyRes = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const etsyData = await etsyRes.json();

    if (!etsyData.results || !etsyData.results.length) {
      log("❌ No Etsy images found");
      return;
    }

    // 2️⃣ Analyze Etsy images → get AliExpress matches
    const analyzeRes = await fetch("/analyze-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etsyResults: etsyData.results, socketId })
    });

    const analyzeData = await analyzeRes.json();

    if (!analyzeData.results || !analyzeData.results.length) {
      log("❌ No AliExpress matches with similarity ≥ 40%");
      return;
    }

    log(`✅ Found ${analyzeData.results.length} matches`);

    // 3️⃣ Display results
    const resultsDiv = document.getElementById("results");
    analyzeData.results.forEach(item => {
      const div = document.createElement("div");
      div.className = "result-card";

      div.innerHTML = `
        <div>
          <a href="${item.etsyLink}" target="_blank">
            <img src="${item.etsyImage}" alt="Etsy">
          </a>
          <p>Etsy Link</p>
        </div>
        <div>
          <a href="${item.aliLink}" target="_blank">
            <img src="${item.aliImage}" alt="AliExpress">
          </a>
          <p>AliExpress Link | Similarity: ${item.similarity}%</p>
        </div>
      `;
      resultsDiv.appendChild(div);
    });

  } catch (err) {
    log("❌ Error occurred: " + err.message);
  }
}
