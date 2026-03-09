const socket = io();

// Logs en direct
socket.on("log", (data) => {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `[${data.time}] ${data.message}<br>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
});

socket.on("connected", (data) => {
  console.log("Connected with socketId:", data.socketId);
});

// Bouton Search
document.getElementById("searchBtn").addEventListener("click", async () => {
  const keyword = document.getElementById("keyword").value.trim();
  const limit = document.getElementById("limit").value;

  if (!keyword) return alert("Please enter a keyword!");

  document.getElementById("results").innerHTML = "";
  document.getElementById("logs").innerHTML = "Starting Etsy search...<br>";

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });

    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      document.getElementById("logs").innerHTML += "No Etsy results found.<br>";
      return;
    }

    // Affichage des résultats Etsy
    for (const item of data.results) {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <div>
          <a href="${item.link}" target="_blank">
            <img src="${item.image}" />
          </a>
        </div>
        <div>
          <p><a href="${item.link}" target="_blank">${item.link}</a></p>
        </div>
      `;
      document.getElementById("results").appendChild(card);
    }

    document.getElementById("logs").innerHTML += `Found ${data.results.length} Etsy items.<br>`;

    // Appel vers /analyze-images pour pipeline AliExpress
    const formData = new FormData();
    const socketId = socket.id;

    data.results.forEach((item) => {
      fetch(item.image)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], "etsy.jpg", { type: blob.type });
          formData.append("images", file);
        })
        .then(async () => {
          formData.append("socketId", socketId);
          const analysisRes = await fetch("/analyze-images", {
            method: "POST",
            body: formData
          });
          const analysisData = await analysisRes.json();
          console.log("Analysis Data:", analysisData);
          // Ici tu peux afficher les correspondances AliExpress similaires
        });
    });

  } catch (err) {
    console.error(err);
    document.getElementById("logs").innerHTML += "Error: " + err.message + "<br>";
  }
});
