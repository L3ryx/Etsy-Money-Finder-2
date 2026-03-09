const socket = io();
let socketId = null;

const logsDiv = document.getElementById("logs");
const resultsDiv = document.getElementById("results");
const searchBtn = document.getElementById("searchBtn");

socket.on("connected", (data) => {
    socketId = data.socketId;
    addLog(`🟢 Connected with socketId: ${socketId}`);
});

socket.on("log", (data) => {
    addLog(data.message);
});

function addLog(message) {
    const time = new Date().toLocaleTimeString();
    logsDiv.innerHTML += `[${time}] ${message}<br>`;
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

async function search() {
    const keyword = document.getElementById("keyword").value.trim();
    const limit = document.getElementById("limit").value || 10;

    if (!keyword) {
        addLog("❌ Please enter a keyword");
        return;
    }

    addLog(`🔎 Searching Etsy for "${keyword}"...`);
    resultsDiv.innerHTML = "";

    try {
        const etsyRes = await fetch("/search-etsy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyword, limit })
        });

        const etsyData = await etsyRes.json();

        if (!etsyData.results || etsyData.results.length === 0) {
            addLog("⚠️ No Etsy results found");
            return;
        }

        addLog(`✅ Found ${etsyData.results.length} Etsy items. Starting image analysis...`);

        // Préparer les fichiers pour analyse
        const formData = new FormData();
        formData.append("socketId", socketId);

        for (const item of etsyData.results) {
            const imgBlob = await fetch(item.image).then(r => r.blob());
            formData.append("images", imgBlob, "etsy.jpg");
            formData.append("links", item.link);
        }

        // Envoyer au serveur pour analyse
        const analyzeRes = await fetch("/analyze-images", {
            method: "POST",
            body: formData
        });

        const analyzeData = await analyzeRes.json();

        // Afficher les résultats
        for (let i = 0; i < analyzeData.results.length; i++) {
            const etsyImage = analyzeData.results[i].image;
            const matches = analyzeData.results[i].matches;

            if (!matches || matches.length === 0) continue;

            const topMatch = matches[0]; // Premier match avec similarity >= 60%

            const card = document.createElement("div");
            card.className = "result-card";

            card.innerHTML = `
                <div>
                    <a href="${etsyData.results[i].link}" target="_blank">
                        <img src="${etsyImage}" alt="Etsy Image">
                    </a>
                </div>
                <div>
                    <a href="${topMatch.url}" target="_blank">
                        <img src="${topMatch.image}" alt="AliExpress Image">
                    </a>
                    <p>Similarity: ${topMatch.similarity}%</p>
                </div>
            `;

            resultsDiv.appendChild(card);
        }

        addLog("🎉 Analysis complete!");

    } catch (err) {
        console.error(err);
        addLog("❌ Error during search or analysis");
    }
}
