const socket = io();

let socketId = null;

socket.on("connected", (data) => {
  socketId = data.socketId;
});

socket.on("log", (data) => {
  const logBox = document.getElementById("logs");
  logBox.innerHTML += `<div>${data.message}</div>`;
  logBox.scrollTop = logBox.scrollHeight;
});

/* ===================================================== */
/* SEARCH ETSY */
/* ===================================================== */

async function searchEtsy() {

  const keyword = document.getElementById("keyword").value;

  const response = await fetch("/search-etsy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      keyword,
      limit: 10
    })
  });

  const data = await response.json();

  const resultsDiv = document.getElementById("etsy-results");
  resultsDiv.innerHTML = "";

  data.results.forEach(item => {

    const div = document.createElement("div");

    div.innerHTML = `
      <img src="${item.image}" width="120"/>
      <a href="${item.link}" target="_blank">Etsy Link</a>
    `;

    resultsDiv.appendChild(div);

  });

}

/* ===================================================== */
/* ANALYZE IMAGES */
/* ===================================================== */

async function analyzeImages() {

  const images = document.querySelectorAll("#etsy-results img");

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

  const resultDiv = document.getElementById("results");
  resultDiv.innerHTML = "";

  data.results.forEach(product => {

    const container = document.createElement("div");

    container.innerHTML = `
      <h3>Etsy Image</h3>
      <img src="${product.image}" width="150">
    `;

    product.matches.forEach(match => {

      const div = document.createElement("div");

      div.innerHTML = `
        <img src="${match.image}" width="120">
        <a href="${match.url}" target="_blank">AliExpress</a>
        <p>Similarity: ${match.similarity}%</p>
      `;

      container.appendChild(div);

    });

    resultDiv.appendChild(container);

  });

}
