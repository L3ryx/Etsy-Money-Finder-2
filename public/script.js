// script.js
const socket = io();
let socketId = null;

socket.on("connected", (data) => {
  socketId = data.socketId;
  console.log("Connected with socketId:", socketId);
});

socket.on("log", (data) => {
  const logsDiv = document.getElementById("logs");
  const p = document.createElement("p");
  p.textContent = `[${data.type}] ${data.message}`;
  logsDiv.appendChild(p);
  logsDiv.scrollTop = logsDiv.scrollHeight;
});

async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;

  if (!keyword) return alert("Please enter a keyword");

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "<p>Loading...</p>";

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });

    const data = await res.json();
    resultsDiv.innerHTML = "";

    for (const item of data.results) {
      // créer un conteneur pour chaque résultat
      const container = document.createElement("div");
      container.className = "result";

      const etsyImg = document.createElement("img");
      etsyImg.src = item.image;
      container.appendChild(etsyImg);

      const etsyLink = document.createElement("a");
      etsyLink.href = item.link;
      etsyLink.target = "_blank";
      etsyLink.textContent = "View on Etsy";
      container.appendChild(etsyLink);

      // bouton pour analyser l'image
      const analyzeBtn = document.createElement("button");
      analyzeBtn.textContent = "Find AliExpress";
      analyzeBtn.onclick = () => analyzeImage(item.image, container);
      container.appendChild(analyzeBtn);

      resultsDiv.appendChild(container);
    }
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = "<p>Error fetching Etsy results</p>";
  }
}

async function analyzeImage(imageUrl, container) {
  const resultsDiv = document.createElement("div");
  resultsDiv.innerHTML = "<p>Finding AliExpress matches...</p>";
  container.appendChild(resultsDiv);

  try {
    // fetch image as blob to send to /analyze-images
    const imgRes = await fetch(imageUrl);
    const blob = await imgRes.blob();
    const file = new File([blob], "etsy.jpg", { type: "image/jpeg" });

    const formData = new FormData();
    formData.append("socketId", socketId);
    formData.append("images", file);

    const res = await fetch("/analyze-images", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    resultsDiv.innerHTML = "";

    const itemResults = data.results[0]?.matches || [];

    if (!itemResults.length) {
      resultsDiv.innerHTML = "<p>No matches found</p>";
      return;
    }

    for (const match of itemResults) {
      const matchDiv = document.createElement("div");
      matchDiv.style.display = "flex";
      matchDiv.style.alignItems = "center";
      matchDiv.style.marginTop = "10px";

      const img = document.createElement("img");
      img.src = match.image;
      img.style.width = "100px";
      img.style.marginRight = "10px";

      const link = document.createElement("a");
      link.href = match.url;
      link.target = "_blank";
      link.textContent = `AliExpress - similarity: ${match.similarity}`;

      matchDiv.appendChild(img);
      matchDiv.appendChild(link);
      resultsDiv.appendChild(matchDiv);
    }
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = "<p>Error finding AliExpress matches</p>";
  }
}
