const socket = io();
let socketId = null;

socket.on("connected", data => {
  socketId = data.socketId;
  log("✅ Connected to server");
});

socket.on("log", data => {
  log(data.message);
});

function log(message) {
  const logs = document.getElementById("logs");
  const line = document.createElement("div");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logs.appendChild(line);
  logs.scrollTop = logs.scrollHeight;
}

async function search() {
  const keyword = document.getElementById("keyword").value.trim();
  const limit = document.getElementById("limit").value;

  if (!keyword) return alert("Please enter a keyword");

  document.getElementById("results").innerHTML = "";
  log(`🔎 Searching Etsy for "${keyword}"...`);

  try {
    const res = await fetch("/search-etsy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit })
    });
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      log("⚠️ No Etsy results found");
      return;
    }

    log(`✅ Found ${data.results.length} Etsy items`);
    displayEtsyResults(data.results);

    // Automatically analyze the images
    await analyzeImages(data.results);
  } catch (err) {
    log(`❌ Etsy search failed: ${err.message}`);
  }
}

function displayEtsyResults(results) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  results.forEach(item => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div>
        <img src="${item.image}" alt="Etsy image">
        <div><a href="${item.link}" target="_blank">Etsy Link</a></div>
      </div>
      <div class="ali-results">Loading...</div>
    `;
    container.appendChild(card);
  });
}

async function analyzeImages(etsyItems) {
  log("🧠 Starting image analysis pipeline...");

  const formData = new FormData();
  etsyItems.forEach((item, i) => {
    formData.append("images", item.image); // pass image URL as file placeholder
  });
  formData.append("socketId", socketId);

  // Because multer expects files, we need to fetch the image as blob
  const tempFormData = new FormData();
  for (const item of etsyItems) {
    const res = await fetch(item.image);
    const blob = await res.blob();
    tempFormData.append("images", new File([blob], "image.jpg"));
  }
  tempFormData.append("socketId", socketId);

  try {
    const res = await fetch("/analyze-images", {
      method: "POST",
      body: tempFormData
    });
    const data = await res.json();

    data.results.forEach((result, idx) => {
      const card = document.getElementById("results").children[idx];
      const aliDiv = card.querySelector(".ali-results");
      aliDiv.innerHTML = "";

      if (!result.matches || result.matches.length === 0) {
        aliDiv.textContent = "No AliExpress match found";
      } else {
        result.matches.forEach(match => {
          const matchDiv = document.createElement("div");
          matchDiv.innerHTML = `
            <img src="${match.image}" width="100" style="margin-right:10px">
            <a href="${match.url}" target="_blank">AliExpress Link</a>
            <span>(${match.similarity}%)</span>
          `;
          aliDiv.appendChild(matchDiv);
        });
      }
    });

    log("✅ Image analysis finished");
  } catch (err) {
    log(`❌ Image analysis failed: ${err.message}`);
  }
}
