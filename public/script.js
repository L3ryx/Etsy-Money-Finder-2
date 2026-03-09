const socket = io();
const resultsContainer = document.getElementById("results");

document.getElementById("searchBtn").addEventListener("click", async () => {
  const keyword = document.getElementById("keyword").value;
  if (!keyword) return alert("Enter a keyword");

  resultsContainer.innerHTML = "Searching...";

  const res = await fetch("/analyze-etsy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword }),
  });

  const data = await res.json();

  if (!data.results || data.results.length === 0) {
    resultsContainer.innerHTML = "No results with similarity ≥ 70%.";
    return;
  }

  resultsContainer.innerHTML = "";

  data.results.forEach(item => {
    const etsyDiv = document.createElement("div");
    etsyDiv.className = "etsy-item";

    etsyDiv.innerHTML = `
      <h3>Etsy Product</h3>
      <a href="${item.etsyLink}" target="_blank">
        <img src="${item.etsyImage}" width="150"/>
      </a>
    `;

    item.matches.forEach(match => {
      const aliDiv = document.createElement("div");
      aliDiv.className = "ali-item";
      aliDiv.innerHTML = `
        <p>Similarity: ${match.similarity}%</p>
        <a href="${match.aliexpressLink}" target="_blank">
          <img src="${match.aliexpressImage}" width="150"/>
        </a>
      `;
      etsyDiv.appendChild(aliDiv);
    });

    resultsContainer.appendChild(etsyDiv);
  });
});
