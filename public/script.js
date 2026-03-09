const searchBtn = document.getElementById("searchBtn");
const keywordInput = document.getElementById("keyword");
const resultsDiv = document.getElementById("results");
const statusP = document.getElementById("status");

searchBtn.addEventListener("click", async () => {
  const keyword = keywordInput.value.trim();
  if (!keyword) return alert("Enter a keyword");

  resultsDiv.innerHTML = "";
  statusP.textContent = "Fetching Etsy images...";

  try {
    // Étape 1 : récupérer les images Etsy via notre serveur
    const etsyRes = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit: 5 })
    });
    const etsyData = await etsyRes.json();

    if (!etsyData.results || etsyData.results.length === 0) {
      statusP.textContent = "No Etsy images found";
      return;
    }

    statusP.textContent = "Checking AliExpress for similar products...";

    // Étape 2 : pour chaque image Etsy, recherche inversée et comparaison
    const allResults = [];
    for (const etsyItem of etsyData.results) {
      const analyzeRes = await fetch("/analyze-etsy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etsyImages: [etsyItem.image] })
      });
      const analyzeData = await analyzeRes.json();
      allResults.push(...analyzeData.results);
    }

    statusP.textContent = "";

    if (allResults.length === 0) {
      resultsDiv.innerHTML = "<p>No results with similarity ≥ 40%</p>";
      return;
    }

    // Étape 3 : afficher les résultats
    for (const item of allResults) {
      const div = document.createElement("div");
      div.classList.add("result");

      const etsyImg = document.createElement("img");
      etsyImg.src = item.etsyImage;
      const aliImg = document.createElement("img");
      aliImg.src = item.aliImage;

      const info = document.createElement("div");
      info.innerHTML = `
        <p>Similarity: ${item.similarity}%</p>
        <p><a href="${item.aliLink}" target="_blank">AliExpress Link</a></p>
      `;

      div.appendChild(etsyImg);
      div.appendChild(aliImg);
      div.appendChild(info);

      resultsDiv.appendChild(div);
    }

  } catch (err) {
    console.error(err);
    statusP.textContent = "Error occurred";
  }
});
