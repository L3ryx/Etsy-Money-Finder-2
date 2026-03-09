const socket = io();
let socketId = null;

// Connection
socket.on("connected", (data) => {
  socketId = data.socketId;
  addLog("Connected to server");
});

// Receive logs
socket.on("log", (data) => {
  addLog(`[${data.type}] ${data.message}`);
});

// Add log to div
function addLog(message) {
  const logs = document.getElementById("logs");
  const p = document.createElement("p");
  p.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  logs.appendChild(p);
  logs.scrollTop = logs.scrollHeight;
}

// Search Etsy button
document.getElementById("searchBtn").addEventListener("click", async () => {
  const keyword = document.getElementById("keyword").value.trim();
  const limit = document.getElementById("limit").value;

  if (!keyword) return alert("Enter a keyword");

  addLog(`Searching Etsy for "${keyword}"...`);
  document.getElementById("results").innerHTML = "";

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const data = await res.json();

    if (data.error) return addLog(`❌ ${data.error}`);

    addLog(`Found ${data.results.length} Etsy items`);

    // Display Etsy items
    for (const item of data.results) {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <a href="${item.link}" target="_blank">
          <img src="${item.image}" alt="Etsy image">
        </a>
        <p>Etsy item</p>
      `;
      document.getElementById("results").appendChild(card);

      // Automatically analyze image
      analyzeImage(item.image);
    }

  } catch (err) {
    addLog(`❌ Etsy search failed: ${err.message}`);
  }
});

// Analyze a single image via /analyze-images
async function analyzeImage(imageUrl) {
  addLog(`Starting analysis for image`);

  try {
    // Convert image URL to Blob
    const imgResp = await fetch(imageUrl);
    const blob = await imgResp.blob();
    const file = new File([blob], "etsy.jpg", { type: blob.type });

    const formData = new FormData();
    formData.append("socketId", socketId);
    formData.append("images", file);

    const res = await fetch("/analyze-images", { method: "POST", body: formData });
    const data = await res.json();

    for (const result of data.results) {
      const card = document.createElement("div");
      card.className = "result-card";

      let html = `<img src="${result.etsyImage}" alt="Etsy"> Etsy image<br>`;
      if (result.matches.length > 0) {
        for (const match of result.matches) {
          html += `<a href="${match.url}" target="_blank"><img src="${match.image}" alt="AliExpress"></a>
                   <p>Similarity: ${(match.similarity*100).toFixed(0)}%</p>`;
        }
      } else {
        html += "<p>No similar AliExpress results</p>";
      }

      card.innerHTML = html;
      document.getElementById("results").appendChild(card);
    }

  } catch (err) {
    addLog(`❌ Image analysis failed: ${err.message}`);
  }
}
