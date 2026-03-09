const socket = io();

const loader = document.getElementById("loader");
const resultsContainer = document.getElementById("results");
const startBtn = document.getElementById("startBtn");

startBtn.addEventListener("click", async () => {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;

  if (!keyword) return alert("⚠️ Entrez un mot clé !");

  loader.classList.remove("hidden");
  startBtn.disabled = true;
  startBtn.innerText = "Loading...";

  try {
    // 1️⃣ Récupérer les annonces Etsy
    const response = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });

    const data = await response.json();
    resultsContainer.innerHTML = "";

    if (!data.results || data.results.length === 0) {
      resultsContainer.innerHTML = "<p>Aucun résultat trouvé.</p>";
      loader.classList.add("hidden");
      startBtn.disabled = false;
      startBtn.innerText = "START";
      return;
    }

    // 2️⃣ Préparer les images pour analyse reverse
    const formData = new FormData();
    for (const item of data.results) {
      // Télécharger l'image Etsy en blob
      const imgRes = await fetch(item.image);
      const blob = await imgRes.blob();
      formData.append("images", blob, "etsy.jpg");
    }
    formData.append("socketId", socket.id);

    // 3️⃣ Envoyer au serveur pour analyse + AliExpress
    const analyzeRes = await fetch("/analyze-images", {
      method: "POST",
      body: formData
    });

    const analyzeData = await analyzeRes.json();

    // 4️⃣ Affichage
    for (const result of analyzeData.results) {
      const etsyImg = result.etsyImage;

      const container = document.createElement("div");
      container.className = "etsy-aliexpress-container";

      const etsyDiv = document.createElement("div");
      etsyDiv.className = "etsy-image";
      etsyDiv.innerHTML = `<img src="${etsyImg}" alt="Etsy Image">`;

      const aliDiv = document.createElement("div");
      aliDiv.className = "aliexpress-images";

      for (const match of result.matches) {
        const card = document.createElement("div");
        card.className = "ali-card";
        card.innerHTML = `
          <img src="${match.image}" alt="AliExpress Image">
          <br/>
          <a href="${match.link}" target="_blank">Voir AliExpress</a>
        `;
        aliDiv.appendChild(card);
      }

      container.appendChild(etsyDiv);
      container.appendChild(aliDiv);
      resultsContainer.appendChild(container);
    }

  } catch (err) {
    console.error(err);
    alert("Erreur serveur ❌");
  }

  loader.classList.add("hidden");
  startBtn.disabled = false;
  startBtn.innerText = "START";
});
