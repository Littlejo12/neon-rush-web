/**
 * Neon Rush (Web) – Full version
 * - 5 lanes
 * - Upgrades: handling, magnet, boost
 * - Local highscore + local leaderboard (top 10 runs)
 * - Online leaderboard + stripe payment via Worker (optional)
 * - Ads: AdSense slot (optional), hide with NoAds
 */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// UI
const uiScore = document.getElementById("score");
const uiWallet = document.getElementById("wallet");
const adbar = document.getElementById("adbar");
const workerStatus = document.getElementById("workerStatus");

const menu = document.getElementById("menu");
const shop = document.getElementById("shop");
const settings = document.getElementById("settings");
const overlay = document.getElementById("overlay");
const leaderboard = document.getElementById("leaderboard");

const btnPlay = document.getElementById("btnPlay");
const btnPause = document.getElementById("btnPause");
const btnShop = document.getElementById("btnShop");
const btnSettings = document.getElementById("btnSettings");
const btnLeaderboard = document.getElementById("btnLeaderboard");
const btnNickname = document.getElementById("btnNickname");

const btnCloseShop = document.getElementById("btnCloseShop");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const btnBackFromSettings = document.getElementById("btnBackFromSettings");
const btnCloseLeaderboard = document.getElementById("btnCloseLeaderboard");

const btnRetry = document.getElementById("btnRetry");
const btnContinue = document.getElementById("btnContinue");
const overText = document.getElementById("overText");

const btnClaimDaily = document.getElementById("btnClaimDaily");
const btnResetSave = document.getElementById("btnResetSave");

const noAdsBadge = document.getElementById("noAdsBadge");
const skinBadge = document.getElementById("skinBadge");

const musicVol = document.getElementById("musicVol");
const sfxVol = document.getElementById("sfxVol");
const musicVal = document.getElementById("musicVal");
const sfxVal = document.getElementById("sfxVal");
const toggleVibrate = document.getElementById("toggleVibrate");
const toggleParticles = document.getElementById("toggleParticles");

const tabLocal = document.getElementById("tabLocal");
const tabOnline = document.getElementById("tabOnline");
const lbLocal = document.getElementById("lbLocal");
const lbOnline = document.getElementById("lbOnline");
const btnRefreshOnline = document.getElementById("btnRefreshOnline");

const priceHandling = document.getElementById("price_handling");
const priceMagnet = document.getElementById("price_magnet");
const priceBoost = document.getElementById("price_boost");

// CONFIG: set your worker base URL (Cloudflare Worker)
// Example: https://neonrush-api.YOURNAME.workers.dev
const WORKER_BASE = ""; // <- set later, can be empty

// Canvas base size
const W = canvas.width, H = canvas.height;

// 5 lanes
const lanes = [W*0.1, W*0.3, W*0.5, W*0.7, W*0.9];

let running = false;
let paused = false;
let gameOver = false;

// Save
const SAVE_KEY = "neonrush_save_v2";

// economy / upgrades
const UPGRADE = {
  handling: { base: 50, grow: 1.55, max: 12 },
  magnet:   { base: 70, grow: 1.60, max: 10 },
  boost:    { base: 90, grow: 1.65, max: 10 },
};

let save = loadSave();

// Game state
let laneIndex = 2; // center in 5 lanes
const player = { x: lanes[laneIndex], y: H*0.82, w: 42, h: 70 };

let obstacles = [];
let coins = [];
let particles = [];

let score = 0;
let runCoins = 0;

let t = 0;
let speed = 3.2;

// road animation
let roadOffset = 0;

// screen shake
let shake = 0;

// boost
let boostActive = false;
let boostLeft = 0;     // frames
let boostCooldown = 0; // frames

// audio
let audioCtx = null;
let musicTimer = null;

function defaultSave() {
  return {
    deviceId: cryptoRandomId(),
    nickname: "Player",
    wallet: { coins: 0, gems: 0 },

    purchases: { noAds: false, skins: { classic: true, neon: false, stealth: false } },
    selectedSkin: "classic",

    upgrades: { handling: 0, magnet: 0, boost: 0 },

    best: { highscore: 0 },
    localBoard: [], // [{name, score, date}]

    daily: { lastClaimDay: "" },

    settings: { musicVol: 60, sfxVol: 70, vibrate: false, particles: true }
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const obj = JSON.parse(raw);
    const d = defaultSave();
    return {
      ...d,
      ...obj,
      wallet: { ...d.wallet, ...(obj.wallet || {}) },
      purchases: {
        ...d.purchases,
        ...(obj.purchases || {}),
        skins: { ...d.purchases.skins, ...((obj.purchases || {}).skins || {}) }
      },
      upgrades: { ...d.upgrades, ...(obj.upgrades || {}) },
      best: { ...d.best, ...(obj.best || {}) },
      settings: { ...d.settings, ...(obj.settings || {}) },
      daily: { ...d.daily, ...(obj.daily || {}) },
      localBoard: Array.isArray(obj.localBoard) ? obj.localBoard : [],
      deviceId: obj.deviceId || cryptoRandomId(),
      nickname: obj.nickname || "Player",
    };
  } catch {
    return defaultSave();
  }
}

function saveNow() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  refreshBadges();
  refreshWalletUI();
  refreshUpgradePrices();
}

function refreshWalletUI() {
  uiWallet.textContent = `Coins: ${save.wallet.coins} • Gems: ${save.wallet.gems}`;
}

function refreshBadges() {
  noAdsBadge.textContent = save.purchases.noAds ? "Ads: Off (No Ads)" : "Ads: On";
  skinBadge.textContent = `Skin: ${cap(save.selectedSkin)}`;
  adbar.classList.toggle("hidden", save.purchases.noAds);
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function cryptoRandomId() {
  // quick ID for device; ok for casual game
  const a = new Uint8Array(16);
  (crypto.getRandomValues ? crypto.getRandomValues(a) : a.fill(Math.random()*255));
  return [...a].map(x => x.toString(16).padStart(2,"0")).join("");
}

// ----- Upgrade math -----
function upgradeCost(key) {
  const lvl = save.upgrades[key] || 0;
  const cfg = UPGRADE[key];
  if (lvl >= cfg.max) return null;
  return Math.floor(cfg.base * Math.pow(cfg.grow, lvl));
}

function refreshUpgradePrices() {
  const cH = upgradeCost("handling");
  const cM = upgradeCost("magnet");
  const cB = upgradeCost("boost");
  priceHandling.textContent = cH === null ? "MAX" : `${cH} Coins (Lvl ${save.upgrades.handling})`;
  priceMagnet.textContent   = cM === null ? "MAX" : `${cM} Coins (Lvl ${save.upgrades.magnet})`;
  priceBoost.textContent    = cB === null ? "MAX" : `${cB} Coins (Lvl ${save.upgrades.boost})`;
}

// ----- Audio -----
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx.resume?.() ?? Promise.resolve();
}
function vol01(v100) { return Math.max(0, Math.min(1, v100 / 100)); }

function playSfx(type) {
  if (!audioCtx) return;
  const v = vol01(save.settings.sfxVol);
  if (v <= 0.001) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain).connect(audioCtx.destination);

  if (type === "coin") {
    osc.type = "triangle";
    osc.frequency.value = 880;
    gain.gain.value = 0.03 * v;
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.06);
    osc.stop(audioCtx.currentTime + 0.08);
  } else if (type === "hit") {
    osc.type = "sawtooth";
    osc.frequency.value = 180;
    gain.gain.value = 0.06 * v;
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.12);
    osc.stop(audioCtx.currentTime + 0.14);
  } else if (type === "lane") {
    osc.type = "sine";
    osc.frequency.value = 520;
    gain.gain.value = 0.018 * v;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } else if (type === "boost") {
    osc.type = "square";
    osc.frequency.value = 260;
    gain.gain.value = 0.025 * v;
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(520, audioCtx.currentTime + 0.12);
    osc.stop(audioCtx.currentTime + 0.14);
  }
}

function startMusic() {
  stopMusic();
  if (!audioCtx) return;
  const mv = vol01(save.settings.musicVol);
  if (mv <= 0.001) return;

  let step = 0;
  musicTimer = setInterval(() => {
    if (!running || paused || gameOver) return;
    const mv2 = vol01(save.settings.musicVol);
    if (mv2 <= 0.001) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    const base = 220;
    const notes = [0, 7, 12, 7, 3, 10, 15, 10];
    osc.frequency.value = base * Math.pow(2, notes[step % notes.length] / 12);
    gain.gain.value = 0.03 * mv2;

    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
    step++;
  }, 220);
}
function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

// ----- Haptics -----
function vibrate(ms) {
  if (!save.settings.vibrate) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ----- Particles -----
function addParticles(x, y, n, kind) {
  if (!save.settings.particles) return;
  for (let i=0; i<n; i++) {
    particles.push({
      x, y,
      vx: (Math.random()*2 - 1) * 2.2,
      vy: (Math.random()*2 - 1) * 2.2 - 1.2,
      life: 40 + Math.random()*20,
      kind
    });
  }
}
function updateParticles() {
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.03;
    p.life -= 1;
  });
  particles = particles.filter(p => p.life > 0);
}

// ----- Game helpers -----
function resetRun() {
  laneIndex = 2;
  player.x = lanes[laneIndex];

  obstacles = [];
  coins = [];
  particles = [];
  score = 0;
  runCoins = 0;

  t = 0;
  speed = 3.2;
  roadOffset = 0;
  shake = 0;

  boostActive = false;
  boostLeft = 0;
  boostCooldown = 0;

  gameOver = false;
  overlay.classList.add("hidden");
  updateHUD();
}

function updateHUD() {
  uiScore.textContent = `Score: ${score}`;
  refreshWalletUI();
}

function playerRect() { return { x: player.x, y: player.y, w: player.w, h: player.h }; }

function rectHit(a, b) {
  return (
    a.x - a.w/2 < b.x + b.w/2 &&
    a.x + a.w/2 > b.x - b.w/2 &&
    a.y - a.h/2 < b.y + b.h/2 &&
    a.y + a.h/2 > b.y - b.h/2
  );
}

function circleRectHit(c, r) {
  const rx = r.x - r.w/2, ry = r.y - r.h/2;
  const cx = Math.max(rx, Math.min(c.x, rx + r.w));
  const cy = Math.max(ry, Math.min(c.y, ry + r.h));
  const dx = c.x - cx, dy = c.y - cy;
  return (dx*dx + dy*dy) < (c.r*c.r);
}

// ----- Spawning (more “alive”) -----
function spawnObstacle() {
  const li = Math.floor(Math.random() * lanes.length);
  // vary size a bit
  const w = 44 + Math.random()*10;
  const h = 70 + Math.random()*18;
  obstacles.push({ x: lanes[li], y: -90, w, h, kind: (Math.random() < 0.15 ? "fast" : "normal") });
}

function spawnCoin() {
  const li = Math.floor(Math.random() * lanes.length);
  coins.push({ x: lanes[li], y: -50, r: 14 });
}

// ----- Boost & Upgrades effect -----
function handlingFactor() {
  // 0..12 -> 1.0..2.2
  const lvl = save.upgrades.handling || 0;
  return 1.0 + lvl * 0.1;
}
function magnetRadius() {
  // 0..10 -> 0..85 px
  const lvl = save.upgrades.magnet || 0;
  return lvl * 8.5;
}
function boostPower() {
  // 0..10 -> multiplier 1.0..1.65
  const lvl = save.upgrades.boost || 0;
  return 1.0 + lvl * 0.065;
}
function boostCooldownFrames() {
  const lvl = save.upgrades.boost || 0;
  // higher level = shorter cooldown
  return Math.max(140, 260 - lvl * 10);
}
function boostDurationFrames() {
  const lvl = save.upgrades.boost || 0;
  return 70 + lvl * 3; // bit longer
}

function tryBoost() {
  if (!running || paused || gameOver) return;
  if (boostCooldown > 0) return;
  boostActive = true;
  boostLeft = boostDurationFrames();
  boostCooldown = boostCooldownFrames();
  playSfx("boost");
  addParticles(player.x, player.y+10, 25, "boost");
  vibrate(25);
}

// ----- Rendering -----
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function drawRoad() {
  // background glow
  const g = ctx.createRadialGradient(W/2, H*0.2, 40, W/2, H*0.2, H);
  g.addColorStop(0, "#182a44");
  g.addColorStop(1, "#05070a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // lane lines
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = "#2b3a52";
  ctx.lineWidth = 3;

  // 5 lanes -> 4 separators
  for (let i=1; i<5; i++) {
    const x = W * (i/5);
    ctx.setLineDash([16, 18]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // moving dashes inside lanes (speed feel)
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "#6aa6ff";
  ctx.lineWidth = 2;

  for (const x of lanes) {
    for (let y = -40; y < H+40; y += 80) {
      const yy = (y + roadOffset) % (H+80) - 40;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x, yy + 24);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  let body = "#e7eef7";
  let glass = "#8aa0b8";
  if (save.selectedSkin === "neon") { body = "#66ffcc"; glass = "#2b3a52"; }
  if (save.selectedSkin === "stealth") { body = "#b7c0cc"; glass = "#0b0f14"; }

  // shadow
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  roundRect(player.x - player.w/2 + 4, player.y - player.h/2 + 6, player.w, player.h, 10);
  ctx.fill();
  ctx.globalAlpha = 1;

  // body
  ctx.fillStyle = body;
  roundRect(player.x - player.w/2, player.y - player.h/2, player.w, player.h, 10);
  ctx.fill();

  // windshield
  ctx.fillStyle = glass;
  roundRect(player.x - player.w/2 + 8, player.y - player.h/2 + 10, player.w - 16, 18, 8);
  ctx.fill();

  // headlights glow
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#6aa6ff";
  roundRect(player.x - player.w/2 + 6, player.y + player.h/2 - 16, player.w - 12, 10, 6);
  ctx.fill();
  ctx.globalAlpha = 1;

  // boost trail indicator
  if (boostActive) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#66ffcc";
    roundRect(player.x - 8, player.y + player.h/2 + 2, 16, 18, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawObstacle(o) {
  ctx.fillStyle = (o.kind === "fast") ? "#ff7a3d" : "#ff4d4d";
  roundRect(o.x - o.w/2, o.y - o.h/2, o.w, o.h, 10);
  ctx.fill();
}

function drawCoin(c) {
  ctx.fillStyle = "#ffd54a";
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
  ctx.fill();
  // shine
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(c.x - 4, c.y - 5, c.r*0.35, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    const a = Math.max(0, Math.min(1, p.life / 60));
    ctx.globalAlpha = a;
    if (p.kind === "coin") ctx.fillStyle = "#ffd54a";
    else if (p.kind === "boost") ctx.fillStyle = "#66ffcc";
    else ctx.fillStyle = "#ff4d4d";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ----- Leaderboard (Local) -----
function pushLocalBoard(scoreValue) {
  const item = {
    name: save.nickname || "Player",
    score: scoreValue,
    date: new Date().toISOString().slice(0, 10),
  };
  save.localBoard.unshift(item);
  save.localBoard.sort((a,b) => b.score - a.score);
  save.localBoard = save.localBoard.slice(0, 10);
  saveNow();
}

function renderLocalBoard() {
  if (!save.localBoard.length) {
    lbLocal.innerHTML = `<p class="tiny muted">Noch keine Runs. Spiel eine Runde 🙂</p>`;
    return;
  }
  lbLocal.innerHTML = save.localBoard.map((r, i) => `
    <div class="lbRow">
      <span>#${i+1} <b>${escapeHtml(r.name)}</b></span>
      <span>${r.score}</span>
    </div>
  `).join("");
}

function escapeHtml(s) {
  return (s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ----- Online API helpers (Worker) -----
async function workerPing() {
  if (!WORKER_BASE) { workerStatus.textContent = "off (no URL)"; return false; }
  try {
    const r = await fetch(`${WORKER_BASE}/ping`, { method: "GET" });
    const ok = r.ok;
    workerStatus.textContent = ok ? "online" : "error";
    return ok;
  } catch {
    workerStatus.textContent = "offline";
    return false;
  }
}

async function submitScoreOnline(scoreValue) {
  if (!WORKER_BASE) return;
  try {
    await fetch(`${WORKER_BASE}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: save.deviceId,
        name: save.nickname || "Player",
        score: scoreValue
      })
    });
  } catch {}
}

async function loadOnlineLeaderboard() {
  if (!WORKER_BASE) {
    lbOnline.innerHTML = `<p class="tiny muted">WORKER_BASE ist leer. Setze die URL in game.js.</p>`;
    return;
  }
  lbOnline.innerHTML = `<p class="tiny muted">Lade…</p>`;
  try {
    const r = await fetch(`${WORKER_BASE}/leaderboard?limit=10`);
    if (!r.ok) throw new Error();
    const data = await r.json(); // [{name, score}]
    lbOnline.innerHTML = data.map((r, i) => `
      <div class="lbRow">
        <span>#${i+1} <b>${escapeHtml(r.name)}</b></span>
        <span>${r.score}</span>
      </div>
    `).join("");
  } catch {
    lbOnline.innerHTML = `<p class="tiny muted">Konnte Online-Leaderboard nicht laden.</p>`;
  }
}

// Stripe: start checkout (Worker creates session + redirect)
async function buyStripe(productId) {
  if (!WORKER_BASE) {
    alert("WORKER_BASE ist leer. Setze deine Worker-URL in game.js.");
    return;
  }
  try {
    const r = await fetch(`${WORKER_BASE}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: save.deviceId,
        productId
      })
    });
    const data = await r.json(); // {url}
    if (!data.url) throw new Error("no url");
    window.location.href = data.url;
  } catch {
    alert("Checkout konnte nicht gestartet werden.");
  }
}

// After payment success, Worker can also provide balance:
async function syncWalletFromServer() {
  if (!WORKER_BASE) return;
  try {
    const r = await fetch(`${WORKER_BASE}/wallet?deviceId=${encodeURIComponent(save.deviceId)}`);
    if (!r.ok) return;
    const data = await r.json(); // {gems}
    if (typeof data.gems === "number") {
      save.wallet.gems = Math.max(save.wallet.gems, data.gems);
      saveNow();
    }
  } catch {}
}

// ----- Game over -----
function endGame() {
  running = false;
  gameOver = true;
  playSfx("hit");
  vibrate(80);
  shake = 10;

  // rewards
  const coinReward = Math.floor(score / 70) + runCoins;
  save.wallet.coins += coinReward;

  // highscore
  if (score > (save.best.highscore || 0)) save.best.highscore = score;

  // local board
  pushLocalBoard(score);

  saveNow();

  overText.textContent = `Score: ${score} • +Coins: ${coinReward} • Highscore: ${save.best.highscore}`;
  overlay.classList.remove("hidden");
  btnPause.disabled = true;

  // send online score (best effort)
  submitScoreOnline(score);
}

// Revive for gems
function revive() {
  if (!gameOver) return;
  if (save.wallet.gems < 10) {
    alert("Nicht genug Gems (10 nötig). Kauf Gems im Shop.");
    return;
  }
  save.wallet.gems -= 10;
  saveNow();

  gameOver = false;
  overlay.classList.add("hidden");
  // clear near obstacles
  obstacles = obstacles.filter(o => o.y < player.y - 140);
  running = true;
  paused = false;
  btnPause.disabled = false;
  btnPause.textContent = "Pause";
}

// Pause
function togglePause() {
  if (!running) return;
  paused = !paused;
  btnPause.textContent = paused ? "Resume" : "Pause";
}

// ----- Controls (handling upgrade affects lane switch smoothness) -----
let targetX = player.x;

function moveLane(dir) {
  if (!running || paused || gameOver) return;
  laneIndex = Math.max(0, Math.min(lanes.length - 1, laneIndex + dir));
  targetX = lanes[laneIndex];
  playSfx("lane");
}

// Tap/swipe & double-tap boost
let touchStartX = null;
let lastTapTime = 0;

canvas.addEventListener("pointerdown", async (e) => {
  canvas.setPointerCapture(e.pointerId);
  touchStartX = e.clientX;
  await ensureAudio();
});

canvas.addEventListener("pointerup", (e) => {
  if (touchStartX == null) return;
  const now = Date.now();
  const dx = e.clientX - touchStartX;
  touchStartX = null;

  // double tap -> boost
  if (now - lastTapTime < 260) {
    tryBoost();
  }
  lastTapTime = now;

  if (!running || paused || gameOver) return;

  if (Math.abs(dx) > 25) moveLane(dx < 0 ? -1 : +1);
  else {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    moveLane(x < rect.width/2 ? -1 : +1);
  }
});

// ----- UI navigation -----
function showPanel(p) {
  shop.classList.add("hidden");
  settings.classList.add("hidden");
  leaderboard.classList.add("hidden");
  if (p) p.classList.remove("hidden");
}

btnShop.addEventListener("click", () => showPanel(shop));
btnSettings.addEventListener("click", () => { applySettingsToUI(); showPanel(settings); });
btnLeaderboard.addEventListener("click", () => { renderLocalBoard(); showPanel(leaderboard); });

btnCloseShop.addEventListener("click", () => showPanel(null));
btnCloseSettings.addEventListener("click", () => showPanel(null));
btnBackFromSettings.addEventListener("click", () => showPanel(null));
btnCloseLeaderboard.addEventListener("click", () => showPanel(null));

btnPlay.addEventListener("click", async () => {
  await ensureAudio();
  await syncWalletFromServer(); // optional
  resetRun();
  running = true;
  paused = false;
  btnPause.disabled = false;
  btnPause.textContent = "Pause";
  startMusic();
  showPanel(null);
});

btnPause.addEventListener("click", () => togglePause());

btnRetry.addEventListener("click", async () => {
  await ensureAudio();
  resetRun();
  running = true;
  paused = false;
  btnPause.disabled = false;
  btnPause.textContent = "Pause";
});

btnContinue.addEventListener("click", () => revive());

btnNickname.addEventListener("click", () => {
  const n = prompt("Dein Name fürs Leaderboard:", save.nickname || "Player");
  if (!n) return;
  save.nickname = n.slice(0, 16);
  saveNow();
  alert(`Gespeichert: ${save.nickname}`);
});

// Leaderboard tabs
tabLocal.addEventListener("click", () => {
  tabLocal.classList.add("active"); tabOnline.classList.remove("active");
  lbLocal.classList.remove("hidden"); lbOnline.classList.add("hidden");
});
tabOnline.addEventListener("click", async () => {
  tabOnline.classList.add("active"); tabLocal.classList.remove("active");
  lbOnline.classList.remove("hidden"); lbLocal.classList.add("hidden");
  await loadOnlineLeaderboard();
});
btnRefreshOnline.addEventListener("click", () => loadOnlineLeaderboard());

// ----- Shop: upgrades & premium -----
document.querySelectorAll("[data-upgrade]").forEach(btn => {
  btn.addEventListener("click", () => buyUpgrade(btn.getAttribute("data-upgrade")));
});
function buyUpgrade(key) {
  const cost = upgradeCost(key);
  if (cost === null) { alert("Schon MAX."); return; }
  if (save.wallet.coins < cost) { alert(`Nicht genug Coins (${cost}).`); return; }
  save.wallet.coins -= cost;
  save.upgrades[key] += 1;
  saveNow();
  alert(`${cap(key)} upgraded! Level ${save.upgrades[key]}`);
}

document.querySelectorAll("[data-buy]").forEach(btn => {
  btn.addEventListener("click", () => handlePurchase(btn.getAttribute("data-buy")));
});

function handlePurchase(id) {
  if (id === "noads") {
    if (save.purchases.noAds) { alert("No Ads ist schon aktiv."); return; }
    if (save.wallet.gems < 150) { alert("Nicht genug Gems (150 nötig). Kauf echte Gems oder hol Daily Reward."); return; }
    save.wallet.gems -= 150;
    save.purchases.noAds = true;
    saveNow();
    alert("No Ads aktiviert!");
    return;
  }
  if (id === "skin_neon") buySkin("neon", 80);
  if (id === "skin_stealth") buySkin("stealth", 80);
}

function buySkin(skin, price) {
  if (save.purchases.skins[skin]) {
    save.selectedSkin = skin;
    saveNow();
    alert(`Skin ausgewählt: ${cap(skin)}`);
    return;
  }
  if (save.wallet.gems < price) { alert(`Nicht genug Gems (${price} nötig).`); return; }
  save.wallet.gems -= price;
  save.purchases.skins[skin] = true;
  save.selectedSkin = skin;
  saveNow();
  alert(`Gekauft & ausgewählt: ${cap(skin)}`);
}

// Stripe buttons
document.querySelectorAll("[data-stripe]").forEach(btn => {
  btn.addEventListener("click", () => buyStripe(btn.getAttribute("data-stripe")));
});

// Daily reward
btnClaimDaily.addEventListener("click", () => {
  const today = new Date().toISOString().slice(0, 10);
  if (save.daily.lastClaimDay === today) {
    alert("Daily Reward schon geholt. Morgen wieder!");
    return;
  }
  save.daily.lastClaimDay = today;
  save.wallet.gems += 25;
  save.wallet.coins += 30;
  saveNow();
  alert("Daily Reward: +25 Gems, +30 Coins");
});

// Reset
btnResetSave.addEventListener("click", () => {
  if (!confirm("Wirklich alles zurücksetzen?")) return;
  localStorage.removeItem(SAVE_KEY);
  save = loadSave();
  refreshBadges();
  refreshWalletUI();
  applySettingsToUI();
  refreshUpgradePrices();
  renderLocalBoard();
  alert("Save zurückgesetzt.");
});

// ----- Settings -----
function applySettingsToUI() {
  musicVol.value = String(save.settings.musicVol);
  sfxVol.value = String(save.settings.sfxVol);
  toggleVibrate.checked = !!save.settings.vibrate;
  toggleParticles.checked = !!save.settings.particles;
  musicVal.textContent = `${save.settings.musicVol}%`;
  sfxVal.textContent = `${save.settings.sfxVol}%`;
}
function updateSettingLabels() {
  musicVal.textContent = `${save.settings.musicVol}%`;
  sfxVal.textContent = `${save.settings.sfxVol}%`;
}

musicVol.addEventListener("input", () => {
  save.settings.musicVol = Number(musicVol.value);
  updateSettingLabels();
  saveNow();
  if (running && !paused && !gameOver) startMusic();
});
sfxVol.addEventListener("input", () => {
  save.settings.sfxVol = Number(sfxVol.value);
  updateSettingLabels();
  saveNow();
  playSfx("lane");
});
toggleVibrate.addEventListener("change", () => {
  save.settings.vibrate = toggleVibrate.checked;
  saveNow();
  vibrate(20);
});
toggleParticles.addEventListener("change", () => {
  save.settings.particles = toggleParticles.checked;
  saveNow();
});

// ----- Main loop -----
function update() {
  // shake
  let sx = 0, sy = 0;
  if (shake > 0) {
    sx = (Math.random()*2 - 1) * shake;
    sy = (Math.random()*2 - 1) * shake;
    shake *= 0.85;
    if (shake < 0.4) shake = 0;
  }
  ctx.setTransform(1, 0, 0, 1, sx, sy);

  // idle draw
  if (!running) {
    drawRoad();
    drawPlayer();
    drawParticles();
    requestAnimationFrame(update);
    return;
  }

  // paused draw
  if (paused) {
    drawRoad();
    for (const c of coins) drawCoin(c);
    for (const o of obstacles) drawObstacle(o);
    drawPlayer();
    drawParticles();

    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#0f1724";
    roundRect(60, H/2 - 50, W-120, 100, 14);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e7eef7";
    ctx.font = "900 22px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", W/2, H/2 + 8);

    requestAnimationFrame(update);
    return;
  }

  t++;

  // difficulty & boost effects
  const boostMul = boostActive ? (1.35 * boostPower()) : 1.0;
  speed = Math.min(8.0, (3.2 + score/220) * boostMul);

  // road
  roadOffset += speed * 4.4;

  // spawns: slightly harder with score
  const obsEvery = Math.max(26, 46 - Math.floor(score/900));
  const coinEvery = 66;

  if (t % obsEvery === 0) spawnObstacle();
  if (t % coinEvery === 0) spawnCoin();

  // boost timers
  if (boostCooldown > 0) boostCooldown--;
  if (boostActive) {
    boostLeft--;
    if (boostLeft <= 0) boostActive = false;
  }

  // move objects
  for (const o of obstacles) {
    const extra = (o.kind === "fast") ? 1.25 : 1.0;
    o.y += speed * 3.2 * extra;
  }
  for (const c of coins) c.y += speed * 2.9;

  obstacles = obstacles.filter(o => o.y < H + 160);
  coins = coins.filter(c => c.y < H + 90);

  // smooth lane movement (handling upgrade)
  const hf = handlingFactor();
  player.x += (targetX - player.x) * (0.22 * hf);

  // magnet
  const mr = magnetRadius();
  if (mr > 0) {
    for (const c of coins) {
      const dx = c.x - player.x;
      const dy = c.y - player.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < mr + 40) {
        c.x += (player.x - c.x) * 0.06;
        c.y += (player.y - c.y) * 0.06;
      }
    }
  }

  // collisions
  for (const o of obstacles) {
    if (rectHit(playerRect(), o)) {
      endGame();
      break;
    }
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    if (circleRectHit(coins[i], playerRect())) {
      save.wallet.coins += 1;
      runCoins += 1;
      addParticles(coins[i].x, coins[i].y, 14, "coin");
      playSfx("coin");
      vibrate(10);
      coins.splice(i, 1);
      saveNow();
    }
  }

  // score tick
  score += 1;
  updateHUD();

  // particles
  updateParticles();

  // render
  drawRoad();
  for (const c of coins) drawCoin(c);
  for (const o of obstacles) drawObstacle(o);
  drawPlayer();
  drawParticles();

  requestAnimationFrame(update);
}

// ----- Drawing helpers -----
function drawRoad() {
  const g = ctx.createRadialGradient(W/2, H*0.2, 40, W/2, H*0.2, H);
  g.addColorStop(0, "#182a44");
  g.addColorStop(1, "#05070a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // lane separators
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = "#2b3a52";
  ctx.lineWidth = 3;

  for (let i=1; i<5; i++) {
    const x = W * (i/5);
    ctx.setLineDash([16, 18]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // moving dashes
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "#6aa6ff";
  ctx.lineWidth = 2;
  for (const x of lanes) {
    for (let y=-40; y<H+40; y+=80) {
      const yy = (y + roadOffset) % (H+80) - 40;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x, yy+24);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  let body = "#e7eef7";
  let glass = "#8aa0b8";
  if (save.selectedSkin === "neon") { body = "#66ffcc"; glass = "#2b3a52"; }
  if (save.selectedSkin === "stealth") { body = "#b7c0cc"; glass = "#0b0f14"; }

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  roundRect(player.x - player.w/2 + 4, player.y - player.h/2 + 6, player.w, player.h, 10);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = body;
  roundRect(player.x - player.w/2, player.y - player.h/2, player.w, player.h, 10);
  ctx.fill();

  ctx.fillStyle = glass;
  roundRect(player.x - player.w/2 + 8, player.y - player.h/2 + 10, player.w - 16, 18, 8);
  ctx.fill();

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#6aa6ff";
  roundRect(player.x - player.w/2 + 6, player.y + player.h/2 - 16, player.w - 12, 10, 6);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (boostActive) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#66ffcc";
    roundRect(player.x - 10, player.y + player.h/2 + 2, 20, 20, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawObstacle(o) {
  ctx.fillStyle = (o.kind === "fast") ? "#ff7a3d" : "#ff4d4d";
  roundRect(o.x - o.w/2, o.y - o.h/2, o.w, o.h, 10);
  ctx.fill();
}

function drawCoin(c) {
  ctx.fillStyle = "#ffd54a";
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(c.x - 4, c.y - 5, c.r*0.35, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    const a = Math.max(0, Math.min(1, p.life / 60));
    ctx.globalAlpha = a;
    if (p.kind === "coin") ctx.fillStyle = "#ffd54a";
    else if (p.kind === "boost") ctx.fillStyle = "#66ffcc";
    else ctx.fillStyle = "#ff4d4d";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ----- Init -----
refreshBadges();
refreshWalletUI();
applySettingsToUI();
refreshUpgradePrices();
renderLocalBoard();
workerPing();
update();

// Add boost button via keyboard (desktop): space
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") tryBoost();
});
