const socket = io();
let socketId = null;

socket.on("connected", (data) => {
  socketId = data.socketId;
  logMessage("Connected to server");
});

socket.on("log", (data) => {
  logMessage(`[${data.type.toUpperCase()}] ${data.message}`);
});

function logMessage(message) {
  const logsDiv = document.getElementById("logs");
  const p = document.createElement("p");
  p.textContent = message;
  logsDiv.appendChild(p);
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

// ========================
// Search Etsy
// ========================
async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;
  if (!keyword) return alert("Enter a keyword");

  logMessage(`Searching Etsy for "${keyword}"`);

  try {
    const resp = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const data = await resp.json();
    displayResults(data.results);
  } catch (err) {
    logMessage("❌ Etsy search failed: " + err.message);
  }
}

// ========================
// Display results
// ========================
function displayResults(results) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  results.forEach(item => {
    const div = document.createElement("div");
    div.className = "result-card";

    const etsyImg = document.createElement("img");
    etsyImg.src = item.image;
    const etsyLink = document.createElement("a");
    etsyLink.href = item.link;
    etsyLink.target = "_blank";
    etsyLink.textContent = "Etsy link";

    div.appendChild(etsyImg);
    div.appendChild(etsyLink);

    resultsDiv.appendChild(div);
  });
}
