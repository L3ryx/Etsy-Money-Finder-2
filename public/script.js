const socket = io();

const startBtn = document.querySelector(".start-btn");
const resultsContainer = document.getElementById("results");
const loader = document.getElementById("loader");

startBtn.addEventListener("click", async () => {
  const keyword = document.querySelector(".input-field").value;
  const limit = document.querySelector(".dropdown").value;

  if(!keyword) return alert("⚠️ Entre un keyword !");

  loader.classList.remove("hidden");
  startBtn.disabled = true;
  startBtn.innerText = "Loading...";

  try {
    // 1️⃣ Récupérer images + liens Etsy
    const etsyResp = await fetch("/search-etsy", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ keyword, limit })
    });
    const etsyData = await etsyResp.json();
    resultsContainer.innerHTML = "";

    if(!etsyData.results || etsyData.results.length === 0) {
      resultsContainer.innerHTML = "<p>Aucun résultat trouvé.</p>";
      return;
    }

    // 2️⃣ Pour chaque image Etsy, récupérer 5 résultats AliExpress
    for(const item of etsyData.results) {
      const revResp = await fetch("/reverse-image-aliexpress", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ imageUrl: item.image })
      });
      const revData = await revResp.json();

      revData.results.forEach(aItem => {
        const card = document.createElement("div");
        card.className = "result-card";
        card.innerHTML = `
          <img src="${aItem.image}" />
          <br/>
          <a href="${aItem.link}" target="_blank">Voir sur AliExpress</a>
        `;
        resultsContainer.appendChild(card);
      });
    }

  } catch(e) {
    console.error(e);
    alert("Erreur serveur ❌");
  }

  loader.classList.add("hidden");
  startBtn.disabled = false;
  startBtn.innerText = "START";
});
