const startBtn = document.querySelector(".start-btn");
const resultsContainer = document.getElementById("results");
const loader = document.getElementById("loader");

startBtn.addEventListener("click", async () => {
  const keyword = document.querySelector(".input-field").value;
  const limit = document.querySelector(".dropdown").value;
  if(!keyword){ alert("⚠️ Entre un keyword !"); return; }

  loader.classList.remove("hidden");
  startBtn.disabled = true;
  startBtn.innerText = "Loading...";

  try {
    const response = await fetch("/search-etsy", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ keyword, limit })
    });

    const data = await response.json();
    resultsContainer.innerHTML = "";

    if(data.results && data.results.length > 0){
      data.results.forEach(item => {
        const row = document.createElement("div");
        row.className = "result-row";

        // Etsy image + link
        const etsyDiv = document.createElement("div");
        etsyDiv.className = "result-etsy";
        etsyDiv.innerHTML = `<img src="${item.etsy.image}"><br><a href="${item.etsy.link}" target="_blank">Voir Etsy</a>`;
        row.appendChild(etsyDiv);

        // AliExpress results
        const aliDiv = document.createElement("div");
        aliDiv.className = "result-aliexpress";

        item.aliexpress.forEach(a => {
          const link = document.createElement("a");
          link.href = a.link;
          link.target = "_blank";
          link.innerHTML = `<img src="${item.etsy.image}"><br>AliExpress`;
          aliDiv.appendChild(link);
        });

        row.appendChild(aliDiv);
        resultsContainer.appendChild(row);
      });
    } else {
      resultsContainer.innerHTML = "<p>Aucun résultat trouvé.</p>";
    }

  } catch(error){
    console.error(error);
    alert("Erreur serveur ❌");
  }

  loader.classList.add("hidden");
  startBtn.disabled = false;
  startBtn.innerText = "START";
});
