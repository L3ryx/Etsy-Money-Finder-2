/* ===================================================== */
/* SOCKET */
/* ===================================================== */
const socket = io();

/* ===================================================== */
/* ELEMENTS */
/* ===================================================== */
const loader = document.getElementById("loader");
const resultsContainer = document.getElementById("results");
const logs = document.getElementById("logs");
const startBtn = document.querySelector(".start-btn");
const imagesInput = document.getElementById("images");
const limitSelect = document.querySelector(".dropdown");

/* ===================================================== */
/* MATRIX SYSTEM (OPTIONAL) */
/* ===================================================== */
const canvas = document.getElementById("matrix");
if(canvas){
  const ctx = canvas.getContext("2d");
  let fontSize = 16, speed = 40, matrixInterval, columns, drops;
  const letters = "010101ETSYMONEYFINDER";

  function resizeCanvas(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  function initMatrix(){
    columns = Math.floor(canvas.width / fontSize);
    drops = new Array(columns).fill(0).map(() => Math.random() * canvas.height);
  }

  function drawMatrix(){
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#00ff66";
    ctx.font = fontSize + "px monospace";
    for(let i=0;i<drops.length;i++){
      const text = letters[Math.floor(Math.random()*letters.length)];
      ctx.fillText(text, i*fontSize, drops[i]*fontSize);
      if(drops[i]*fontSize > canvas.height && Math.random() > 0.97){
        drops[i] = 0;
      }
      drops[i]++;
    }
  }

  function startMatrix(){ clearInterval(matrixInterval); initMatrix(); matrixInterval = setInterval(drawMatrix, speed); }
  function accelerateMatrix(){ clearInterval(matrixInterval); speed = 15; matrixInterval = setInterval(drawMatrix, speed); }
  function slowMatrix(){ clearInterval(matrixInterval); speed = 60; matrixInterval = setInterval(drawMatrix, speed); }
  startMatrix();
}

/* ===================================================== */
/* SOCKET LOGS */
/* ===================================================== */
socket.on('connected', data => appendLog(`Connected with Socket ID: ${data.socketId}`));
socket.on('log', data => appendLog(data.message));

function appendLog(message){
  if(logs){
    logs.innerHTML += `[${new Date().toLocaleTimeString()}] ${message}<br>`;
    logs.scrollTop = logs.scrollHeight;
  }
}

/* ===================================================== */
/* START BUTTON */
/* ===================================================== */
startBtn.addEventListener("click", async () => {
  const files = imagesInput.files;
  if(!files.length){ alert("⚠️ Sélectionne au moins une image !"); return; }

  const limit = limitSelect.value;

  showLoader();
  startBtn.disabled = true;
  startBtn.innerText = "Loading...";

  const formData = new FormData();
  for(const file of files) formData.append("images", file);
  formData.append("socketId", socket.id);
  formData.append("limit", limit);

  try{
    const res = await fetch("/analyze-images", { method:"POST", body: formData });
    const data = await res.json();

    resultsContainer.innerHTML = "";

    if(data.results && data.results.length){
      data.results.forEach(item => {
        item.matches.forEach(match => {
          // Affichage seulement si similarité >= 70%
          if(match.similarity >= 70){
            const card = document.createElement("div");
            card.className = "result-card";

            card.innerHTML = `
              <div class="info">
                <img src="${item.etsy}" alt="Etsy Image">
                <div><a href="${item.etsy}" target="_blank">Etsy Link</a></div>
              </div>
              <div class="info">
                <img src="${match.image}" alt="AliExpress Image">
                <div><a href="${match.link}" target="_blank">AliExpress Link</a></div>
              </div>
              <div class="info score">${match.similarity}% similarity</div>
            `;
            resultsContainer.appendChild(card);
          }
        });
      });
    } else {
      resultsContainer.innerHTML = "<p>Aucun résultat trouvé.</p>";
    }

  } catch(err){
    console.error(err);
    alert("Erreur serveur ❌");
  }

  hideLoader();
  startBtn.disabled = false;
  startBtn.innerText = "START";
});

/* ===================================================== */
/* LOADER CONTROL */
/* ===================================================== */
function showLoader(){ loader.style.display = "flex"; }
function hideLoader(){ loader.style.display = "none"; }

/* ===================================================== */
/* EXPLOSION EFFECT (OPTIONAL) */
/* ===================================================== */
function explosionEffect(){
  for(let i=0;i<30;i++){
    const spark = document.createElement("div");
    spark.style.position = "fixed";
    spark.style.left = Math.random()*window.innerWidth + "px";
    spark.style.top = Math.random()*window.innerHeight + "px";
    spark.style.width = "6px";
    spark.style.height = "6px";
    spark.style.background = "#00ff66";
    spark.style.borderRadius = "50%";
    spark.style.boxShadow = "0 0 20px #00ff66";
    spark.style.pointerEvents = "none";
    document.body.appendChild(spark);
    setTimeout(()=> spark.remove(), 800);
  }
}
