const socket = io();

const loader = document.getElementById("loader");
const resultsContainer = document.getElementById("results");
const startBtn = document.getElementById("startBtn");

startBtn.addEventListener("click", async () => {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;
  const files = document.getElementById("images").files;

  if (!keyword && files.length === 0) return alert("⚠️ Entrez un keyword ou une image");

  showLoader();
  startBtn.disabled = true;

  let etsyResults = [];
  if (keyword) {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const data = await res.json();
    etsyResults = data.results || [];
  }

  let aliResults = [];
  if (files.length > 0) {
    const formData = new FormData();
    for (const file of files) formData.append("images", file);
    formData.append("socketId", socket.id);

    const res = await fetch("/analyze-images", { method: "POST", body: formData });
    const data = await res.json();
    aliResults = data.results || [];
  }

  resultsContainer.innerHTML = "";

  // Affiche résultats Etsy
  etsyResults.forEach(item => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `<img src="${item.image}"><br><a href="${item.link}" target="_blank">Voir annonce Etsy</a>`;
    resultsContainer.appendChild(card);
  });

  // Affiche résultats AliExpress
  aliResults.forEach(item => {
    item.aliResults.forEach(a => {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `<img src="${a.image}"><br><a href="${a.link}" target="_blank">Voir annonce AliExpress</a>`;
      resultsContainer.appendChild(card);
    });
  });

  hideLoader();
  startBtn.disabled = false;
});

function showLoader() { loader.classList.remove("hidden"); }
function hideLoader() { loader.classList.add("hidden"); }
