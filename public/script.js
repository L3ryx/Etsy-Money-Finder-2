// script.js
const socket = io();
let socketId;

socket.on("connected", data => {
  socketId = data.socketId;
  log("🟢 Connected to server");
});

socket.on("log", data => {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `<div>[${data.type}] ${data.message}</div>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
});

async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";
  log("🔎 Searching Etsy...");

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const data = await res.json();

    for (const item of data.results) {
      const div = document.createElement("div");
      div.classList.add("result");
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.gap = "20px";
      div.innerHTML = `
        <div>
          <img src="${item.etsyImage}" width="200">
          <br>
          <a href="${item.etsyLink}" target="_blank">Lien Etsy</a>
        </div>
        <div class="aliexpressMatches">Recherche AliExpress...</div>
      `;
      resultsDiv.appendChild(div);

      // Recherche AliExpress automatiquement
      const matchRes = await fetch("/find-aliexpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etsyImage: item.etsyImage, socketId })
      });
      const matchData = await matchRes.json();

      const matchDiv = div.querySelector(".aliexpressMatches");
      matchDiv.innerHTML = "";

      if (matchData.matches.length === 0) {
        matchDiv.innerHTML = "❌ Aucun match AliExpress ≥ 70%";
        continue;
      }

      for (const m of matchData.matches) {
        const mDiv = document.createElement("div");
        mDiv.style.display = "flex";
        mDiv.style.alignItems = "center";
        mDiv.style.gap = "10px";
        mDiv.style.marginTop = "5px";
        mDiv.innerHTML = `
          <img src="${m.aliImage}" width="100">
          <a href="${m.aliLink}" target="_blank">Lien AliExpress (${Math.round(m.similarity*100)}%)</a>
        `;
        matchDiv.appendChild(mDiv);
      }
    }
  } catch (err) {
    log("❌ Error during search: " + err.message);
  }
}

function log(message) {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `<div>${message}</div>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
}
