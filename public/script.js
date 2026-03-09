const socket = io();

const startBtn = document.getElementById("startBtn");
const loader = document.getElementById("loader");
const resultsContainer = document.getElementById("results");

startBtn.addEventListener("click", async () => {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;

  if (!keyword) return alert("⚠️ Entre un keyword !");

  loader.classList.remove("hidden");
  startBtn.disabled = true;
  startBtn.innerText = "Loading...";

  try {
    const response = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });

    const data = await response.json();
    displayResults(data.results);

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

  if (!results || results.length === 0) {
    resultsContainer.innerHTML = "<p>Aucun résultat trouvé.</p>";
    return;
  }

  results.forEach(item => {
    const card = document.createElement("div");
    card.className = "result-card";

    // Etsy Image + Link
    let html = `<div class="etsy">
                  <img src="${item.etsy.image}" />
                  <a href="${item.etsy.link}" target="_blank">Etsy Listing</a>
                </div>`;

    // AliExpress images + links
    html += `<div class="aliexpress-container">`;
    item.aliexpress.forEach(a => {
      html += `<div class="aliexpress-card">
                 <img src="${a.image}" />
                 <a href="${a.link}" target="_blank">AliExpress</a>
               </div>`;
    });
    html += `</div>`;

    card.innerHTML = html;
    resultsContainer.appendChild(card);
  });
}
