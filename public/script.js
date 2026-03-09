const socket = io();
let socketId = null;

socket.on("connected", data => {
  socketId = data.socketId;
  addLog(`Connected to server, socketId: ${socketId}`);
});

socket.on("log", data => addLog(data.message));

function addLog(msg) {
  const logs = document.getElementById("logs");
  const p = document.createElement("p");
  p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logs.appendChild(p);
  logs.scrollTop = logs.scrollHeight;
}

// ========================
// ETSY SEARCH
// ========================
async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value || 10;

  if (!keyword) return addLog("Please enter a keyword");

  addLog(`Searching Etsy for "${keyword}"...`);

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      addLog("No Etsy results found");
      return;
    }

    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "";

    for (const item of data.results) {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <div>
          <img src="${item.image}" />
          <a href="${item.link}" target="_blank">Etsy Link</a>
        </div>
        <div id="ali-${item.link.replace(/\W/g, '')}">Analyzing...</div>
      `;
      resultsDiv.appendChild(card);

      // Start image analysis
      analyzeImage(item.image, card.querySelector(`#ali-${item.link.replace(/\W/g, '')}`));
    }
  } catch (err) {
    addLog("Search error: " + err.message);
  }
}

// ========================
// ANALYZE IMAGE
// ========================
async function analyzeImage(imageUrl, containerDiv) {
  addLog("Starting image analysis...");

  try {
    const blob = await fetch(imageUrl).then(res => res.blob());
    const file = new File([blob], "image.jpg", { type: blob.type });
    const formData = new FormData();
    formData.append("images", file);
    formData.append("socketId", socketId);

    const res = await fetch("/analyze-images", { method: "POST", body: formData });
    const data = await res.json();

    containerDiv.innerHTML = "";

    for (const r of data.results) {
      for (const m of r.matches) {
        const div = document.createElement("div");
        div.innerHTML = `
          <img src="${m.image}" />
          <a href="${m.url}" target="_blank">AliExpress Link (Similarity ${m.similarity}%)</a>
        `;
        containerDiv.appendChild(div);
      }
    }
  } catch (err) {
    containerDiv.innerHTML = "Analysis failed";
    addLog("Image analysis error: " + err.message);
  }
}
