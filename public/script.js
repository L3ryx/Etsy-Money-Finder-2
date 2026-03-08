/* ===================================================== */
/* SOCKET CONNECTION */
/* ===================================================== */
const socket = io();

/* ===================================================== */
/* ELEMENTS */
/* ===================================================== */
const loader = document.getElementById("loader");
const resultsContainer = document.getElementById("results");

/* ===================================================== */
/* MATRIX EFFECT (OPTIONNEL) */
/* ===================================================== */
const canvas = document.getElementById("matrix");
if (canvas) {
  const ctx = canvas.getContext("2d");
  let columns, drops;
  const letters = "010101ETSYMONEYFINDER";
  const fontSize = 16;
  let speed = 40;
  let matrixInterval;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    columns = Math.floor(canvas.width / fontSize);
    drops = new Array(columns).fill(0).map(() => Math.random() * canvas.height);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function drawMatrix() {
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#00ff66";
    ctx.font = fontSize + "px monospace";

    for (let i = 0; i < drops.length; i++) {
      const text = letters[Math.floor(Math.random() * letters.length)];
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);
      drops[i]++;
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.97) drops[i] = 0;
    }
  }

  function startMatrix() {
    clearInterval(matrixInterval);
    matrixInterval = setInterval(drawMatrix, speed);
  }
  startMatrix();
}

/* ===================================================== */
/* LOADER CONTROL */
/* ===================================================== */
function showLoader() { loader.style.display = "flex"; }
function hideLoader() { loader.style.display = "none"; }

/* ===================================================== */
/* SEARCH & REVERSE IMAGE + COMPARISON */
/* ===================================================== */
async function startSearch() {
  const keyword = document.querySelector(".input-field").value;
  const limit = document.querySelector(".dropdown").value;

  if (!keyword) {
    alert("⚠️ Entre un keyword !");
    return;
  }

  showLoader();
  resultsContainer.innerHTML = "";

  try {
    // 1️⃣ Recherche Etsy par mot-clé
    const etsyRes = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit, socketId: socket.id })
    });
    const etsyData = await etsyRes.json();

    if (!etsyData.results || etsyData.results.length === 0) {
      resultsContainer.innerHTML = "<p>Aucun résultat Etsy trouvé.</p>";
      hideLoader();
      return;
    }

    // 2️⃣ Pour chaque image Etsy : reverse image + AliExpress + comparaison OpenAI
    for (const etsyItem of etsyData.results) {
      // Affiche image Etsy en attendant les comparaisons
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `<h4>Etsy</h4>
                        <img src="${etsyItem.image}" />
                        <br><a href="${etsyItem.link}" target="_blank">Voir annonce</a>
                        <div class="ali-results"></div>`;
      resultsContainer.appendChild(card);
      const aliContainer = card.querySelector(".ali-results");

      // 2a️⃣ Reverse image via backend (ScraperAPI + filtre AliExpress)
      const reverseRes = await fetch("/reverse-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: etsyItem.image, limit: 5, socketId: socket.id })
      });
      const reverseData = await reverseRes.json();

      if (!reverseData.results || reverseData.results.length === 0) {
        aliContainer.innerHTML = "<p>Aucun résultat AliExpress.</p>";
        continue;
      }

      // 2b️⃣ Comparaison OpenAI
      let matched = false;
      for (const aliItem of reverseData.results) {
        const compRes = await fetch("/compare-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ etsyImage: etsyItem.image, aliImage: aliItem.image, socketId: socket.id })
        });
        const compData = await compRes.json();
        const similarity = compData.similarity;

        if (similarity >= 70) {
          aliContainer.innerHTML = `<h4>AliExpress</h4>
                                    <img src="${aliItem.image}" />
                                    <br><a href="${aliItem.link}" target="_blank">Voir produit</a>
                                    <p>Similarity: ${similarity}%</p>`;
          matched = true;
          break; // Stop comparaison si ≥70%
        }
      }

      if (!matched) {
        aliContainer.innerHTML = "<p>Aucune correspondance ≥70%.</p>";
      }
    }

  } catch (err) {
    console.error(err);
    alert("Erreur serveur ❌");
  }

  hideLoader();
}

/* ===================================================== */
/* START BUTTON EVENT */
/* ===================================================== */
document.querySelector(".start-btn").addEventListener("click", startSearch);

/* ===================================================== */
/* SOCKET LOG PROGRESS */
/* ===================================================== */
socket.on("log", (data) => {
  console.log(data.message);
});
