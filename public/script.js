const socket = io();
let socketId = "";

socket.on("connected", data => {
  socketId = data.socketId;
  log("Connected to server: " + socketId);
});

socket.on("log", data => {
  log(data.message);
});

function log(msg) {
  const logs = document.getElementById("logs");
  logs.innerHTML += `<div>${msg}</div>`;
  logs.scrollTop = logs.scrollHeight;
}

async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value || 10;

  if (!keyword) return alert("Enter a keyword!");

  document.getElementById("results").innerHTML = "";
  log("Searching Etsy...");

  const res = await fetch("/search-etsy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, limit })
  });
  const data = await res.json();

  log(`Found ${data.results.length} Etsy results`);
  if (!data.results.length) return;

  // Convert Etsy images to files for analysis
  const formData = new FormData();
  formData.append("socketId", socketId);
  for (const item of data.results) {
    const imgRes = await fetch(item.image);
    const blob = await imgRes.blob();
    formData.append("images", new File([blob], "etsy.jpg"));
  }

  log("Starting image analysis...");
  const analysisRes = await fetch("/analyze-images", {
    method: "POST",
    body: formData
  });
  const analysisData = await analysisRes.json();

  displayResults(analysisData.results);
}

function displayResults(results) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  for (const r of results) {
    const etsyImg = r.image;
    for (const match of r.matches) {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <div>
          <a href="${etsyImg}" target="_blank">
            <img src="${etsyImg}" />
          </a>
        </div>
        <div>
          <a href="${match.url}" target="_blank">
            <img src="${match.image}" />
          </a>
          <div>Similarity: ${match.similarity}%</div>
        </div>
      `;
      container.appendChild(card);
    }
  }
}
