const socket = io();

// Logs
socket.on("log", data => {
  const logsDiv = document.getElementById("logs");
  logsDiv.innerHTML += `[${data.type}] ${data.message}<br>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
});

// Connection
socket.on("connected", data => {
  console.log("Socket connected:", data.socketId);
});

// Display results
function displayResults(results) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  results.forEach(result => {
    const div = document.createElement("div");
    div.className = "result";

    // Etsy Image
    const etsyImg = document.createElement("img");
    etsyImg.src = result.etsyImage;
    div.appendChild(etsyImg);

    // Etsy Name
    const title = document.createElement("p");
    title.textContent = result.etsyName;
    div.appendChild(title);

    // AliExpress Matches
    result.matches.forEach(match => {
      const a = document.createElement("a");
      a.href = match.url;
      a.target = "_blank";
      a.textContent = `AliExpress (sim: ${match.similarity})`;
      div.appendChild(a);
      div.appendChild(document.createElement("br"));
    });

    resultsDiv.appendChild(div);
  });
}

// Search Etsy
async function search() {
  const keyword = document.getElementById("keyword").value;
  const limit = document.getElementById("limit").value;

  const res = await fetch("/search-etsy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, limit })
  });
  const data = await res.json();

  // Display Etsy images only for now
  displayResults(data.results.map(r => ({
    etsyImage: r.image,
    etsyName: "Etsy Item",
    matches: []
  })));
}

// Upload images for analysis
async function analyzeImages(files) {
  const socketId = socket.id;
  const formData = new FormData();
  for (const f of files) formData.append("images", f);
  formData.append("socketId", socketId);

  const res = await fetch("/analyze-images", { method: "POST", body: formData });
  const data = await res.json();

  displayResults(data.results);
}
