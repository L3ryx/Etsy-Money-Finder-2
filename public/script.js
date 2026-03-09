const socket = io();
let socketId;

socket.on("connected", data => {
  socketId = data.socketId;
  log("Connected to server");
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
  log("Searching Etsy...");

  const res = await fetch("/search-etsy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, limit })
  });
  const data = await res.json();

  // Lance toutes les recherches AliExpress en parallèle
  await Promise.all(
    data.results.map(async item => {
      const div = document.createElement("div");
      div.classList.add("result");
      div.innerHTML = `
        <img src="${item.etsyImage}" width="200">
        <a href="${item.etsyLink}" target="_blank">Lien Etsy</a>
        <div class="aliexpressMatches">Finding AliExpress matches...</div>
      `;
      resultsDiv.appendChild(div);

      try {
        const matchRes = await fetch("/find-aliexpress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ etsyImage: item.etsyImage, socketId })
        });
        const matchData = await matchRes.json();

        const matchDiv = div.querySelector(".aliexpressMatches");
        if (matchData.matches.length === 0) {
          matchDiv.innerHTML = "No AliExpress match ≥ 70%";
        } else {
          matchDiv.innerHTML = "";
          for (const m of matchData.matches) {
            matchDiv.innerHTML += `
              <div style="display:flex;align-items:center;gap:10px;margin-top:5px;">
                <img src="${m.aliImage}" width="100">
                <a href="${m.aliLink}" target="_blank">Lien AliExpress (${Math.round(m.similarity*100)}%)</a>
              </div>
            `;
          }
        }
      } catch (err) {
        const matchDiv = div.querySelector(".aliexpressMatches");
        matchDiv.innerHTML = "Error finding AliExpress matches";
        console.error(err);
      }
    })
  );
}

function log(message) {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `<div>${message}</div>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
}
