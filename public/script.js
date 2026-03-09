const socket = io();

const loader = document.getElementById("loader");
const resultsContainer = document.getElementById("results");
const startBtn = document.getElementById("startBtn");

startBtn.addEventListener("click", async () => {
    const keyword = document.getElementById("keyword").value;
    const limit = document.getElementById("limit").value;

    if(!keyword){ alert("⚠️ Entre un keyword !"); return; }

    loader.classList.remove("hidden");
    startBtn.disabled = true;
    startBtn.innerText = "Loading...";

    try{
        const response = await fetch("/search-etsy", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({keyword, limit, socketId: socket.id})
        });
        const data = await response.json();
        resultsContainer.innerHTML = "";

        for(const item of data.results){
            const container = document.createElement("div");
            container.className = "etsy-aliexpress-container";

            // Etsy image
            const etsyDiv = document.createElement("div");
            etsyDiv.className = "etsy-image";
            etsyDiv.innerHTML = `<img src="${item.image}" /><a href="${item.link}" target="_blank">Voir annonce Etsy</a>`;

            // AliExpress placeholder (sera rempli via ScraperAPI sur serveur)
            const aliDiv = document.createElement("div");
            aliDiv.className = "aliexpress-images";

            if(item.aliexpress && item.aliexpress.length>0){
                item.aliexpress.forEach(ali=>{
                    const aliCard = document.createElement("div");
                    aliCard.className = "ali-card";
                    aliCard.innerHTML = `<img src="${ali.image}" /><a href="${ali.link}" target="_blank">Voir AliExpress</a>`;
                    aliDiv.appendChild(aliCard);
                });
            }

            container.appendChild(etsyDiv);
            container.appendChild(aliDiv);
            resultsContainer.appendChild(container);
        }
    } catch(err){
        console.error(err);
        alert("Erreur serveur ❌");
    }

    loader.classList.add("hidden");
    startBtn.disabled = false;
    startBtn.innerText = "START";
});
