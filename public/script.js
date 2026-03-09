/* =========================================
SOCKET CONNECTION
========================================= */

const socket = io();

let socketId = null;

socket.on("connected", (data) => {

  socketId = data.socketId;

  addLog("Connected to server");

});

socket.on("log", (data) => {

  addLog(data.message);

});

/* =========================================
LOG DISPLAY
========================================= */

function addLog(message) {

  const logBox = document.getElementById("logs");

  const line = document.createElement("div");

  line.textContent = message;

  logBox.appendChild(line);

  logBox.scrollTop = logBox.scrollHeight;

}

/* =========================================
SEARCH ETSY
========================================= */

async function searchEtsy() {

  const keyword = document.getElementById("keyword").value;

  if (!keyword) {
    alert("Enter keyword");
    return;
  }

  addLog("Searching Etsy...");

  const response = await fetch("/search-etsy", {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      keyword: keyword,
      limit: 10
    })

  });

  const data = await response.json();

  const resultsDiv = document.getElementById("etsy-results");

  resultsDiv.innerHTML = "";

  data.results.forEach((item, index) => {

    const container = document.createElement("div");

    container.className = "etsy-item";

    container.innerHTML = `
      <img src="${item.image}" width="120">
      <br>
      <a href="${item.link}" target="_blank">Open Etsy</a>
    `;

    resultsDiv.appendChild(container);

  });

  addLog(`${data.results.length} Etsy items loaded`);

}

/* =========================================
ANALYZE IMAGES
========================================= */

async function analyzeImages() {

  const images = document.querySelectorAll("#etsy-results img");

  if (!images.length) {
    alert("No Etsy images loaded");
    return;
  }

  addLog("Starting image analysis...");

  const formData = new FormData();

  formData.append("socketId", socketId);

  for (const img of images) {

    const response = await fetch(img.src);

    const blob = await response.blob();

    formData.append("images", blob, "etsy.jpg");

  }

  const response = await fetch("/analyze-images", {

    method: "POST",
    body: formData

  });

  const data = await response.json();

  displayResults(data.results);

}

/* =========================================
DISPLAY RESULTS
========================================= */

function displayResults(results) {

  const resultDiv = document.getElementById("results");

  resultDiv.innerHTML = "";

  results.forEach(product => {

    const block = document.createElement("div");

    block.className = "result-block";

    block.innerHTML = `
      <h3>Etsy Product</h3>
      <img src="${product.image}" width="160">
      <h4>AliExpress Matches</h4>
    `;

    if (!product.matches.length) {

      block.innerHTML += "<p>No matches found</p>";

    }

    product.matches.forEach(match => {

      const matchDiv = document.createElement("div");

      matchDiv.className = "match";

      matchDiv.innerHTML = `
        <img src="${match.image}" width="120">
        <br>
        <a href="${match.url}" target="_blank">Open AliExpress</a>
        <p>Similarity: ${match.similarity}%</p>
      `;

      block.appendChild(matchDiv);

    });

    resultDiv.appendChild(block);

  });

  addLog("Analysis complete");

}
