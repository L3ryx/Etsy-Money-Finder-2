const socket = io();

const startBtn = document.getElementById("startBtn");
const resultsContainer = document.getElementById("results");
const loader = document.getElementById("loader");

startBtn.addEventListener("click", async () => {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;

  if (!keyword) {
    alert("⚠️ Entrez un keyword !");
    return;
  }

  startBtn.disabled = true;
  startBtn.innerText = "Loading...";
  loader.classList.remove("hidden");
  resultsContainer.innerHTML = "";

  try {
    const response = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit, socketId: socket.id })
    });

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      resultsContainer.innerHTML = "<p>Aucun résultat trouvé.</p>";
    } else {
      displayResults(data.results);
    }
  } catch (err) {
    console.error(err);
    alert("Erreur serveur ❌");
  }

  loader.classList.add("hidden");
  startBtn.disabled = false;
  startBtn.innerText = "START";
});

function displayResults(results) {
  resultsContainer.innerHTML = "";

  results.forEach(item => {
    const card = document.createElement("div");
    card.className = "result-card";

    // Etsy + AliExpress côte à côte
    let aliHtml = "";
    item.aliexpress.forEach(a => {
      aliHtml += `
        <div class="ali-block">
          <img src="${a.image}" alt="AliExpress" />
          <a href="${a.link}" target="_blank">Voir AliExpress</a>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="etsy-block">
        <img src="${item.etsyImage}" alt="Etsy" />
        <a href="${item.etsyLink}" target="_blank">Voir Etsy</a>
      </div>
      <div class="ali-container">
        ${aliHtml}
      </div>
    `;

    resultsContainer.appendChild(card);
  });
}
