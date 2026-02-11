// Neon Rush (Web) - Simple Lane Runner
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const uiScore = document.getElementById("score");
const uiCoins = document.getElementById("coins");

const btnPlay = document.getElementById("btnPlay");
const btnShop = document.getElementById("btnShop");
const btnMusic = document.getElementById("btnMusic");
const shop = document.getElementById("shop");
const btnCloseShop = document.getElementById("btnCloseShop");

const overlay = document.getElementById("overlay");
const overText = document.getElementById("overText");
const btnRetry = document.getElementById("btnRetry");
const btnContinue = document.getElementById("btnContinue");

let running = false;
let gameOver = false;

const W = canvas.width, H = canvas.height;
const lanes = [W * 0.25, W * 0.5, W * 0.75];
let laneIndex = 1;

const player = { x: lanes[laneIndex], y: H * 0.82, w: 42, h: 70 };
let obstacles = [];
let coins = [];
let score = 0;
let coinCount = 0;

let t = 0;
let speed = 3.2;

let musicOn = true;

// Tiny "music" using WebAudio (no external files)
let audioCtx = null;
let musicInterval = null;

function startMusic() {
  if (!musicOn) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  stopMusic();
  let step = 0;
  musicInterval = setInterval(() => {
    if (!running || gameOver || !musicOn) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    const base = 220;
    const notes = [0, 7, 12, 7, 3, 10, 15, 10];
    osc.frequency.value = base * Math.pow(2, notes[step % notes.length] / 12);
    gain.gain.value = 0.03;

    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
    step++;
  }, 220);
}

function stopMusic() {
  if (musicInterval) clearInterval(musicInterval);
  musicInterval = null;
}

function reset() {
  laneIndex = 1;
  player.x = lanes[laneIndex];
  obstacles = [];
  coins = [];
  score = 0;
  coinCount = 0;
  t = 0;
  speed = 3.2;
  gameOver = false;
  overlay.classList.add("hidden");
  updateHUD();
}

function updateHUD() {
  uiScore.textContent = `Score: ${score}`;
  uiCoins.textContent = `Coins: ${coinCount}`;
}

function spawnObstacle() {
  const li = Math.floor(Math.random() * lanes.length);
  obstacles.push({
    x: lanes[li],
    y: -80,
    w: 46,
    h: 76
  });
}

function spawnCoin() {
  const li = Math.floor(Math.random() * lanes.length);
  coins.push({
    x: lanes[li],
    y: -40,
    r: 14
  });
}

function rectHit(a, b) {
  return (
    a.x - a.w/2 < b.x + b.w/2 &&
    a.x + a.w/2 > b.x - b.w/2 &&
    a.y - a.h/2 < b.y + b.h/2 &&
    a.y + a.h/2 > b.y - b.h/2
  );
}

function circleRectHit(c, r) {
  // circle (c.x,c.y,c.r) vs rect centered at r.x,r.y
  const rx = r.x - r.w/2, ry = r.y - r.h/2;
  const cx = Math.max(rx, Math.min(c.x, rx + r.w));
  const cy = Math.max(ry, Math.min(c.y, ry + r.h));
  const dx = c.x - cx, dy = c.y - cy;
  return (dx*dx + dy*dy) < (c.r*c.r);
}

function drawRoad() {
  ctx.clearRect(0, 0, W, H);

  // road lane lines
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = "#2b3a52";
  ctx.lineWidth = 3;

  for (let i=1; i<3; i++) {
    const x = W * (i/3);
    ctx.setLineDash([16, 18]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  // car body
  ctx.fillStyle = "#e7eef7";
  roundRect(player.x - player.w/2, player.y - player.h/2, player.w, player.h, 10);
  ctx.fill();

  // windshield
  ctx.fillStyle = "#8aa0b8";
  roundRect(player.x - player.w/2 + 8, player.y - player.h/2 + 10, player.w - 16, 18, 8);
  ctx.fill();
}

function drawObstacle(o) {
  ctx.fillStyle = "#ff4d4d";
  roundRect(o.x - o.w/2, o.y - o.h/2, o.w, o.h, 10);
  ctx.fill();
}

function drawCoin(c) {
  ctx.fillStyle = "#ffd54a";
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function endGame() {
  running = false;
  gameOver = true;
  overText.textContent = `Score: ${score} • Coins: ${coinCount}`;
  overlay.classList.remove("hidden");
}

function continueDemo() {
  // Demo revive: remove nearest obstacle and keep going once.
  if (!gameOver) return;
  gameOver = false;
  overlay.classList.add("hidden");
  obstacles = obstacles.filter(o => o.y < player.y - 120);
  running = true;
}

function update() {
  if (!running) {
    drawRoad();
    drawPlayer();
    requestAnimationFrame(update);
    return;
  }

  t++;

  // difficulty ramp
  speed = Math.min(7.2, 3.2 + score / 180);

  // spawn logic
  if (t % 42 === 0) spawnObstacle();
  if (t % 70 === 0) spawnCoin();

  // move objects
  for (const o of obstacles) o.y += speed * 3.3;
  for (const c of coins) c.y += speed * 3.0;

  // cleanup
  obstacles = obstacles.filter(o => o.y < H + 120);
  coins = coins.filter(c => c.y < H + 80);

  // collisions
  for (const o of obstacles) {
    if (rectHit(player, o)) {
      endGame();
      break;
    }
  }
  for (let i = coins.length - 1; i >= 0; i--) {
    if (circleRectHit(coins[i], playerRect())) {
      coinCount += 1;
      coins.splice(i, 1);
    }
  }

  if (!gameOver) {
    score += 1;
    updateHUD();
  }

  // draw
  drawRoad();
  for (const c of coins) drawCoin(c);
  for (const o of obstacles) drawObstacle(o);
  drawPlayer();

  requestAnimationFrame(update);
}

function playerRect() {
  return { x: player.x, y: player.y, w: player.w, h: player.h };
}

// Controls: swipe left/right or tap sides
let touchStartX = null;

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  touchStartX = e.clientX;
  // iOS audio: user gesture needed
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
});

canvas.addEventListener("pointerup", (e) => {
  if (touchStartX == null) return;
  const dx = e.clientX - touchStartX;
  touchStartX = null;

  if (Math.abs(dx) > 25) {
    if (dx < 0) moveLane(-1);
    else moveLane(+1);
  } else {
    // tap: left half -> left, right half -> right
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width/2) moveLane(-1);
    else moveLane(+1);
  }
});

function moveLane(dir) {
  if (!running || gameOver) return;
  laneIndex = Math.max(0, Math.min(lanes.length - 1, laneIndex + dir));
  player.x = lanes[laneIndex];
}

// UI buttons
btnPlay.addEventListener("click", async () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume();
  reset();
  running = true;
  startMusic();
});

btnRetry.addEventListener("click", () => {
  reset();
  running = true;
});

btnContinue.addEventListener("click", () => continueDemo());

btnShop.addEventListener("click", () => shop.classList.toggle("hidden"));
btnCloseShop.addEventListener("click", () => shop.classList.add("hidden"));

btnMusic.addEventListener("click", async () => {
  musicOn = !musicOn;
  btnMusic.textContent = `Music: ${musicOn ? "On" : "Off"}`;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume();
  if (musicOn) startMusic();
  else stopMusic();
});

// Demo purchases
document.querySelectorAll("[data-buy]").forEach(btn => {
  btn.addEventListener("click", () => {
    const what = btn.getAttribute("data-buy");
    alert(`Demo-Kauf: ${what}\n\nEchte Käufe: z.B. Stripe Checkout + Server (empfohlen).`);
  });
});

update();
