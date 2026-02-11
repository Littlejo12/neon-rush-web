// Neon Rush (Web) – “Alive” version: menu + settings + shop + audio volumes + particles + save
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const uiScore = document.getElementById("score");
const uiWallet = document.getElementById("wallet");
const adbar = document.getElementById("adbar");

const menu = document.getElementById("menu");
const shop = document.getElementById("shop");
const settings = document.getElementById("settings");
const overlay = document.getElementById("overlay");

const btnPlay = document.getElementById("btnPlay");
const btnPause = document.getElementById("btnPause");
const btnShop = document.getElementById("btnShop");
const btnSettings = document.getElementById("btnSettings");

const btnCloseShop = document.getElementById("btnCloseShop");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const btnBackFromSettings = document.getElementById("btnBackFromSettings");

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

// Canvas base size
const W = canvas.width, H = canvas.height;
const lanes = [W * 0.25, W * 0.5, W * 0.75];

let running = false;
let paused = false;
let gameOver = false;

// Save state (LocalStorage)
const SAVE_KEY = "neonrush_save_v1";
let save = loadSave();

// Game state
let laneIndex = 1;
const player = { x: lanes[laneIndex], y: H * 0.82, w: 42, h: 70 };
let obstacles = [];
let coins = [];
let particles = [];
let score = 0;
let t = 0;
let speed = 3.2;

// Road animation
let roadOffset = 0;

// Screen shake
let shake = 0;

// Audio (WebAudio) – simple music + sfx
let audioCtx = null;
let musicTimer = null;

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
    gain.gain.value = 0.05 * v;
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.12);
    osc.stop(audioCtx.currentTime + 0.14);
  } else if (type === "lane") {
    osc.type = "sine";
    osc.frequency.value = 520;
    gain.gain.value = 0.015 * v;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
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

// ----- Save / Settings -----
function defaultSave() {
  return {
    wallet: { coins: 0, gems: 0 },
    purchases: { noAds: false, skins: { classic: true, neon: false, stealth: false } },
    selectedSkin: "classic",
    daily: { lastClaimDay: "" },
    settings: { musicVol: 60, sfxVol: 70, vibrate: false, particles: true }
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const obj = JSON.parse(raw);
    // merge safe
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
      settings: { ...d.settings, ...(obj.settings || {}) },
      daily: { ...d.daily, ...(obj.daily || {}) }
    };
  } catch {
    return defaultSave();
  }
}

function saveNow() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  refreshBadges();
  refreshWalletUI();
}

function refreshBadges() {
  noAdsBadge.textContent = save.purchases.noAds ? "Ads: Off (No Ads)" : "Ads: On";
  skinBadge.textContent = `Skin: ${capitalize(save.selectedSkin)}`;
  adbar.classList.toggle("hidden", save.purchases.noAds);
}

function refreshWalletUI() {
  uiWallet.textContent = `Coins: ${save.wallet.coins} • Gems: ${save.wallet.gems}`;
}

function applySettingsToUI() {
  musicVol.value = String(save.settings.musicVol);
  sfxVol.value = String(save.settings.sfxVol);
  toggleVibrate.checked = !!save.settings.vibrate;
  toggleParticles.checked = !!save.settings.particles;
  musicVal.textContent = `${save.settings.musicVol}%`;
  sfxVal.textContent = `${save.settings.sfxVol}%`;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ----- Game helpers -----
function resetRun() {
  laneIndex = 1;
  player.x = lanes[laneIndex];
  obstacles = [];
  coins = [];
  particles = [];
  score = 0;
  t = 0;
  speed = 3.2;
  roadOffset = 0;
  shake = 0;
  gameOver = false;
  overlay.classList.add("hidden");
  updateHUD();
}

function updateHUD() {
  uiScore.textContent = `Score: ${score}`;
  refreshWalletUI();
}

function spawnObstacle() {
  const li = Math.floor(Math.random() * lanes.length);
  obstacles.push({ x: lanes[li], y: -90, w: 46, h: 76 });
}

function spawnCoin() {
  const li = Math.floor(Math.random() * lanes.length);
  coins.push({ x: lanes[li], y: -50, r: 14 });
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
  const rx = r.x - r.w/2, ry = r.y - r.h/2;
  const cx = Math.max(rx, Math.min(c.x, rx + r.w));
  const cy = Math.max(ry, Math.min(c.y, ry + r.h));
  const dx = c.x - cx, dy = c.y - cy;
  return (dx*dx + dy*dy) < (c.r*c.r);
}

function playerRect() { return { x: player.x, y: player.y, w: player.w, h: player.h }; }

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
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.03;
    p.life -= 1;
  });
  particles = particles.filter(p => p.life > 0);
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
  // Parallax road stripes
  ctx.clearRect(0, 0, W, H);

  // glow vignette
  const g = ctx.createRadialGradient(W/2, H*0.2, 40, W/2, H*0.2, H);
  g.addColorStop(0, "#182a44");
  g.addColorStop(1, "#05070a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // lane lines
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

  // moving center dashes for speed feeling
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "#6aa6ff";
  ctx.lineWidth = 2;
  for (let i=0; i<lanes.length; i++) {
    // draw faint stripes in each lane
    const x = lanes[i];
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
  // skin colors
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
  // small shine
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(c.x - 4, c.y - 5, c.r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    const a = Math.max(0, Math.min(1, p.life / 60));
    ctx.globalAlpha = a;
    ctx.fillStyle = (p.kind === "coin") ? "#ffd54a" : "#ff4d4d";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ----- Game over / pause -----
function endGame() {
  running = false;
  gameOver = true;
  playSfx("hit");
  vibrate(80);
  shake = 10;
  overText.textContent = `Score: ${score} • +Coins: ${Math.floor(score/80)} • Coins: ${save.wallet.coins}`;
  overlay.classList.remove("hidden");

  // reward some coins by score
  const reward = Math.floor(score / 80);
  if (reward > 0) {
    save.wallet.coins += reward;
    saveNow();
  }

  btnPause.disabled = true;
  menu.classList.remove("hidden");
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  btnPause.textContent = paused ? "Resume" : "Pause";
}

function revive() {
  if (!gameOver) return;
  if (save.wallet.gems < 10) {
    alert("Nicht genug Gems (10 nötig). Hol dir im Shop ein Gems Pack (Demo).");
    return;
  }
  save.wallet.gems -= 10;
  saveNow();
  gameOver = false;
  overlay.classList.add("hidden");
  // clear near obstacles
  obstacles = obstacles.filter(o => o.y < player.y - 120);
  running = true;
  paused = false;
  btnPause.disabled = false;
  btnPause.textContent = "Pause";
}

// ----- Main loop -----
function update() {
  // shake transform
  let sx = 0, sy = 0;
  if (shake > 0) {
    sx = (Math.random()*2 - 1) * shake;
    sy = (Math.random()*2 - 1) * shake;
    shake *= 0.85;
    if (shake < 0.4) shake = 0;
  }
  ctx.setTransform(1, 0, 0, 1, sx, sy);

  if (!running) {
    drawRoad();
    drawPlayer();
    drawParticles();
    requestAnimationFrame(update);
    return;
  }
  if (paused) {
    drawRoad();
    for (const c of coins) drawCoin(c);
    for (const o of obstacles) drawObstacle(o);
    drawPlayer();
    drawParticles();

    // pause text
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#0f1724";
    roundRect(60, H/2 - 50, W-120, 100, 14);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e7eef7";
    ctx.font = "bold 22px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", W/2, H/2 + 8);

    requestAnimationFrame(update);
    return;
  }

  t++;

  // difficulty
  speed = Math.min(7.4, 3.2 + score / 180);

  // road movement
  roadOffset += speed * 4.2;

  // spawns
  if (t % 42 === 0) spawnObstacle();
  if (t % 70 === 0) spawnCoin();

  // move
  for (const o of obstacles) o.y += speed * 3.4;
  for (const c of coins) c.y += speed * 3.0;

  // cleanup
  obstacles = obstacles.filter(o => o.y < H + 140);
  coins = coins.filter(c => c.y < H + 80);

  // collisions
  for (const o of obstacles) {
    if (rectHit(player, o)) { endGame(); break; }
  }
  for (let i = coins.length - 1; i >= 0; i--) {
    if (circleRectHit(coins[i], playerRect())) {
      save.wallet.coins += 1;
      addParticles(coins[i].x, coins[i].y, 14, "coin");
      playSfx("coin");
      vibrate(10);
      coins.splice(i, 1);
      saveNow();
    }
  }

  // score
  if (!gameOver) {
    score += 1;
    updateHUD();
  }

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

// ----- Input (swipe/tap) -----
let touchStartX = null;

canvas.addEventListener("pointerdown", async (e) => {
  canvas.setPointerCapture(e.pointerId);
  touchStartX = e.clientX;
  await ensureAudio(); // iOS needs gesture
});

canvas.addEventListener("pointerup", (e) => {
  if (touchStartX == null) return;
  const dx = e.clientX - touchStartX;
  touchStartX = null;

  if (!running || paused || gameOver) return;

  if (Math.abs(dx) > 25) moveLane(dx < 0 ? -1 : +1);
  else {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    moveLane(x < rect.width/2 ? -1 : +1);
  }
});

function moveLane(dir) {
  laneIndex = Math.max(0, Math.min(lanes.length - 1, laneIndex + dir));
  player.x = lanes[laneIndex];
  playSfx("lane");
}

// ----- UI navigation -----
function showPanel(p) {
  // menu stays visible as “home”
  shop.classList.add("hidden");
  settings.classList.add("hidden");
  if (p) p.classList.remove("hidden");
}

btnShop.addEventListener("click", () => showPanel(shop));
btnSettings.addEventListener("click", () => { applySettingsToUI(); showPanel(settings); });
btnCloseShop.addEventListener("click", () => showPanel(null));
btnCloseSettings.addEventListener("click", () => showPanel(null));
btnBackFromSettings.addEventListener("click", () => showPanel(null));

btnPlay.addEventListener("click", async () => {
  await ensureAudio();
  resetRun();
  running = true;
  paused = false;
  btnPause.disabled = false;
  btnPause.textContent = "Pause";
  startMusic();
  // hide panels except menu stays (you can hide it if you prefer)
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

// ----- Shop purchases (Demo, real logic) -----
document.querySelectorAll("[data-buy]").forEach(btn => {
  btn.addEventListener("click", () => handlePurchase(btn.getAttribute("data-buy")));
});

function handlePurchase(id) {
  if (id === "gems_100") { save.wallet.gems += 100; saveNow(); alert("+100 Gems!"); return; }
  if (id === "gems_500") { save.wallet.gems += 500; saveNow(); alert("+500 Gems!"); return; }

  if (id === "noads") {
    if (save.purchases.noAds) { alert("No Ads ist schon aktiv."); return; }
    if (save.wallet.gems < 150) { alert("Nicht genug Gems (150 nötig). Hol dir ein Gems Pack."); return; }
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
    alert(`Skin ausgewählt: ${capitalize(skin)}`);
    return;
  }
  if (save.wallet.gems < price) { alert(`Nicht genug Gems (${price} nötig).`); return; }
  save.wallet.gems -= price;
  save.purchases.skins[skin] = true;
  save.selectedSkin = skin;
  saveNow();
  alert(`Gekauft & ausgewählt: ${capitalize(skin)}`);
}

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

// Reset save
btnResetSave.addEventListener("click", () => {
  if (!confirm("Wirklich alles zurücksetzen?")) return;
  localStorage.removeItem(SAVE_KEY);
  save = loadSave();
  refreshBadges();
  refreshWalletUI();
  applySettingsToUI();
  alert("Save zurückgesetzt.");
});

// ----- Settings handlers -----
function updateSettingLabels() {
  musicVal.textContent = `${save.settings.musicVol}%`;
  sfxVal.textContent = `${save.settings.sfxVol}%`;
}

musicVol.addEventListener("input", () => {
  save.settings.musicVol = Number(musicVol.value);
  updateSettingLabels();
  saveNow();
  // restart music to reflect volume
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

// ----- Init -----
refreshBadges();
refreshWalletUI();
applySettingsToUI();
update();
