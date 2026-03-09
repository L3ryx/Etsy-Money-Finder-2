const socket = io();
let socketId;

// Connexion Socket
socket.on("connected", (data) => {
  socketId = data.socketId;
  log("Connected to server");
});

// Logs reçus depuis le serveur
socket.on("log", (data) => {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `<div>[${data.type}] ${data.message}</div>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
});

// Fonction de log côté client
function log(message) {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `<div>${message}</div>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

// Fonction principale de recherche
async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";
  log("Searching Etsy...");

  try {
    // Recherche Etsy
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit }),
    });
    const data = await res.json();

    for (const item of data.results) {
      const div = document.createElement("div");
      div.classList.add("result");
      div.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:20px;">
          <div>
            <img src="${item.etsyImage}" width="200">
            <br>
            <a href="${item.etsyLink}" target="_blank">Lien Etsy</a>
          </div>
          <div class="aliexpressMatches">
            Finding AliExpress matches...
          </div>
        </div>
      `;
      resultsDiv.appendChild(div);

      // Recherche automatique AliExpress pour chaque image Etsy
      const matchRes = await fetch("/find-aliexpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etsyImage: item.etsyImage, socketId }),
      });

      const matchData = await matchRes.json();
      const matchDiv = div.querySelector(".aliexpressMatches");
      matchDiv.innerHTML = "";

      if (matchData.matches && matchData.matches.length > 0) {
        for (const m of matchData.matches) {
          matchDiv.innerHTML += `
            <div style="display:flex;align-items:center;gap:10px;margin-top:5px;">
              <img src="${m.aliImage}" width="100">
              <a href="${m.aliLink}" target="_blank">
                AliExpress (${Math.round(m.similarity * 100)}%)
              </a>
            </div>
          `;
        }
      } else {
        matchDiv.innerHTML = "<div>No similar AliExpress matches (≥70%)</div>";
      }
    }
  } catch (err) {
    log("Error finding AliExpress matches");
    console.error(err);
  }
}
