const socket = io();
let socketId = null;
const logsDiv = document.getElementById("logs");
const resultsDiv = document.getElementById("results");

socket.on("connected", data => {
  socketId = data.socketId;
  addLog(`🟢 Connected (socketId: ${socketId})`);
});

socket.on("log", data => addLog(data.message));

function addLog(msg) {
  const time = new Date().toLocaleTimeString();
  logsDiv.innerHTML += `[${time}] ${msg}<br>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

document.getElementById("searchBtn").addEventListener("click", async () => {
  const keyword = document.getElementById("keyword").value.trim();
  const limit = document.getElementById("limit").value || 10;
  if (!keyword) return addLog("❌ Enter a keyword");

  addLog(`🔎 Searching Etsy for "${keyword}"...`);
  resultsDiv.innerHTML = "";

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const data = await res.json();
    if (!data.results || data.results.length === 0) return addLog("⚠️ No results");

    addLog(`✅ Found ${data.results.length} Etsy items`);

    data.results.forEach(item => {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <div><a href="${item.link}" target="_blank">
        <img src="${item.image}" alt="Etsy Image"></a></div>
        <div><p>Waiting for analysis...</p></div>`;
      resultsDiv.appendChild(card);
    });
  } catch (err) {
    addLog("❌ Search failed");
    console.error(err);
  }
});
