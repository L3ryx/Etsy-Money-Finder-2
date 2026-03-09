const socket = io();

// Affiche les logs en temps réel
socket.on("log", (data) => {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `[${new Date(data.time).toLocaleTimeString()}] ${data.message}<br>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
});

// Récupère le socketId pour l’envoyer avec les requêtes
let socketId = null;
socket.on("connected", (data) => {
  socketId = data.socketId;
  console.log("Connected with socketId:", socketId);
});

// Fonction de recherche Etsy
async function search() {
  const keyword = document.getElementById("keyword").value.trim();
  const limit = document.getElementById("limit").value || 10;

  if (!keyword) return alert("Please enter a keyword");

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Searching Etsy...";

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit }),
    });
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      resultsDiv.innerHTML = "No Etsy results found";
      return;
    }

    resultsDiv.innerHTML = "";

    // Affiche les images Etsy et lance l’analyse
    for (const item of data.results) {
      const card = document.createElement("div");
      card.className = "result-card";

      const etsyImg = document.createElement("img");
      etsyImg.src = item.image;
      const etsyLink = document.createElement("a");
      etsyLink.href = item.link;
      etsyLink.target = "_blank";
      etsyLink.textContent = "Etsy link";

      const infoDiv = document.createElement("div");
      infoDiv.appendChild(etsyImg);
      infoDiv.appendChild(document.createElement("br"));
      infoDiv.appendChild(etsyLink);

      card.appendChild(infoDiv);
      resultsDiv.appendChild(card);

      // Analyse l'image pour AliExpress
      analyzeImage(item.image, card);
    }
  } catch (err) {
    console.error("Search error:", err);
    resultsDiv.innerHTML = "Error during search";
  }
}

// Analyse image avec serveur
async function analyzeImage(imageUrl, card) {
  try {
    const blob = await fetch(imageUrl).then((r) => r.blob());
    const file = new File([blob], "image.jpg");

    const formData = new FormData();
    formData.append("socketId", socketId);
    formData.append("images", file);

    const res = await fetch("/analyze-images", { method: "POST", body: formData });
    const data = await res.json();

    if (!data.results || data.results.length === 0) return;

    const matches = data.results[0].matches;
    if (matches.length === 0) {
      const p = document.createElement("p");
      p.textContent = "No AliExpress matches";
      card.appendChild(p);
    } else {
      matches.forEach((m) => {
        const a = document.createElement("a");
        a.href = m.url;
        a.target = "_blank";

        const img = document.createElement("img");
        img.src = m.image;
        img.style.width = "100px";
        img.style.margin = "5px";

        a.appendChild(img);
        card.appendChild(a);
      });
    }
  } catch (err) {
    console.error("Image analysis error:", err);
    const p = document.createElement("p");
    p.textContent = "Image analysis error: " + err.message;
    card.appendChild(p);
  }
}
