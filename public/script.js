const socket = io();

const loader = document.getElementById("loader");
const resultsContainer = document.getElementById("results");
const startBtn = document.getElementById("startBtn");

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
    resultsContainer.innerHTML = "";

    if (data.results && data.results.length > 0) {
      data.results.forEach(item => {
        const card = document.createElement("div");
        card.className = "result-card";

        card.innerHTML = `
          <img src="${item.image}" />
          <br/>
          <a href="${item.link}" target="_blank">Voir annonce</a>
        `;
        resultsContainer.appendChild(card);
      });
    } else {
      resultsContainer.innerHTML = "<p>Aucun résultat trouvé.</p>";
    }
  } catch (err) {
    console.error(err);
    alert("Erreur serveur ❌");
  }

  loader.classList.add("hidden");
  startBtn.disabled = false;
  startBtn.innerText = "START";
});
