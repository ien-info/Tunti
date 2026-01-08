
/* Tunti – Web Prototype (Multiplayer + Data)
 * Language: မြန်မာ UI
 * Author: You + Copilot
 */

// ======================== CONFIG ========================
// Firebase Config (သင့် Project အချက်အလက်များဖြင့် ပြင်ပါ)
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  databaseURL: "https://REPLACE_ME-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};
// =======================================================

const WIDTH = 18;
const HEIGHT = 12;
const EMOJI = {
  plains: "🟩", forest: "🌲", mountain: "⛰️", water: "🌊", city: "🏛️",
  farm: "🌾", lumber: "🪵", market: "🛍️", barracks: "⚔️", port: "⚓",
  infantry: "🛡️", archer: "🏹", cavalry: "🐎", ship: "⛵",
};

const PLAYERS = [
  { id: 0, name: "မြန်မာ", color: "#d4af37", capitalHP: 5 },
  { id: 1, name: "ထိုင်း",  color: "#2b7de9", capitalHP: 5 },
];

const COSTS = {
  build: {
    farm: { timber: 20, gold: 10 },
    lumber: { gold: 10 },
    market: { timber: 30, rice: 20 },
    barracks: { timber: 50, gold: 50 },
    port: { timber: 40, gold: 30 },
  },
  train: {
    infantry: { rice: 10, gold: 10 },
    archer: { timber: 10, gold: 15 },
    cavalry: { rice: 20, gold: 30 },
    ship: { timber: 40, gold: 20 },
  },
};
const PRODUCTION = {
  farm: { rice: 8 },
  lumber: { timber: 6 },
  market: { gold: 6, spices: 2 },
};
const UNIT_STATS = {
  infantry: { atk: 2, def: 2, move: 1, kind: "land" },
  archer:   { atk: 3, def: 1, move: 1, kind: "land" },
  cavalry:  { atk: 3, def: 2, move: 2, kind: "land" },
  ship:     { atk: 3, def: 2, move: 2, kind: "sea" },
};

// ---- Deterministic RNG (mulberry32) & seeded random ----
function mulberry32(a){ return function(){ a+=0x6D2B79F5; let t=a; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; } }
function strToSeed(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }

// ======================== STATE =========================
let state = {
  turn: 0,
  currentPlayer: 0,
  resources: [
    { rice: 100, gold: 100, timber: 100, spices: 0 },
    { rice: 100, gold: 100, timber: 100, spices: 0 },
  ],
  tiles: [], // {x,y,terrain,building:null|type,owner:null|pid,unit:null|{type,owner,hp},isCity:false}
  capitals: [
    { x: 4, y: 8, owner: 0 },  // Yangon/Dagon approx
    { x: 12, y: 6, owner: 1 }, // Bangkok approx
  ],
  selected: { tileIndex: null },

  // Multiplayer
  online: { enabled: false, roomCode: null, myName: "", myPlayerId: null, lastPush: 0 },
  _applyingRemote: false,
};

// ===================== FIREBASE SETUP ===================
let db = null;
function initFirebase() {
  if (!firebaseConfig || firebaseConfig.apiKey === "REPLACE_ME") {
    console.warn("⚠️ Firebase config not set. Online disabled.");
    setConnStatus("Offline (Config မပြင်ရသေး)");
    return;
  }
  const app = firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  setConnStatus("Ready (Firebase)");
}
// Helpers for UI
function setConnStatus(msg){ document.getElementById("connStatus").textContent = "Status: " + msg; }
function setRoleInfo(){ 
  const p = state.online.myPlayerId;
  const role = p === 0 ? "Player 0 (မြန်မာ)" : p === 1 ? "Player 1 (ထိုင်း)" : "Spectator";
  document.getElementById("roleInfo").textContent = "Role: " + role;
}

// =================== MAP INITIALIZATION =================
function initMap(seedStr = "tunti-local") {
  const rnd = mulberry32(strToSeed(seedStr));
  const tiles = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let terrain = "plains";
      const r = rnd();
      if (r < 0.12) terrain = "mountain";
      else if (r < 0.30) terrain = "forest";
      else if (r < 0.36) terrain = "water";
      tiles.push({ x, y, terrain, building: null, owner: null, unit: null, isCity: false });
    }
  }
  // river
  for (let x = 2; x < WIDTH - 2; x++) {
    const ry = Math.max(1, Math.min(HEIGHT - 2, Math.floor(HEIGHT / 2 + Math.sin(x / 2) * 2)));
    const idx = ry * WIDTH + x;
    tiles[idx].terrain = "water";
  }
  // capitals
  state.capitals.forEach((c, i) => {
    const idx = c.y * WIDTH + c.x;
    tiles[idx].isCity = true;
    tiles[idx].terrain = "city";
    tiles[idx].owner = i;
    tiles[idx].building = i === 0 ? "pagoda" : "palace";
  });
  giveInitialTerritory(tiles, state.capitals[0], 0, 2);
  giveInitialTerritory(tiles, state.capitals[1], 1, 2);
  state.tiles = tiles;
}
function giveInitialTerritory(tiles, c, owner, r) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
      const idx = y * WIDTH + x;
      if (tiles[idx].terrain !== "water") tiles[idx].owner = owner;
    }
  }
}

// ========================= RENDER =======================
function render() {
  const mapEl = document.getElementById("map");
  mapEl.innerHTML = "";
  state.tiles.forEach((t, i) => {
    const tile = document.createElement("div");
    const cls = ["tile", t.terrain];
    if (t.owner !== null) cls.push(`own-${t.owner}`);
    if (state.selected.tileIndex === i) cls.push("selected");
    if (t.isCity) cls.push("city");
    tile.className = cls.join(" ");
    tile.title = `(${t.x},${t.y}) ${t.terrain}${t.owner !== null ? " / "+PLAYERS[t.owner].name:""}`;

    // badge
    const badge = document.createElement("div");
    badge.className = "badge";
    if (t.isCity) badge.textContent = EMOJI.city + " City";
    else if (t.building) badge.textContent = EMOJI[t.building] + " " + t.building;
    tile.appendChild(badge);

    // owner ring
    const ring = document.createElement("div"); ring.className = "owner-ring"; tile.appendChild(ring);

    // unit
    const unitEl = document.createElement("div"); unitEl.className = "unit";
    unitEl.textContent = t.unit ? (EMOJI[t.unit.type] + " HP:" + t.unit.hp) : "";
    tile.appendChild(unitEl);

    tile.addEventListener("click", () => onTileClick(i));
    mapEl.appendChild(tile);
  });

  document.getElementById("turnInfo").textContent =
    `လက်ရှိတစ်ဝှမ်း: Turn ${state.turn} – ${PLAYERS[state.currentPlayer].name}`;
  const r = state.resources[state.currentPlayer];
  document.getElementById("resources").textContent =
    `အရင်းအမြစ်: 🌾 ${r.rice} | 🪵 ${r.timber} | 🛍️ ${r.spices} | 💰 ${r.gold}`;
  document.getElementById("kingdomInfo").innerHTML = `
    <strong>${PLAYERS[0].name}</strong> Capital HP: ${PLAYERS[0].capitalHP}<br/>
    <strong>${PLAYERS[1].name}</strong> Capital HP: ${PLAYERS[1].capitalHP}
  `;
  document.getElementById("productionInfo").innerHTML = `
    🌾 +${PRODUCTION.farm.rice} rice/turn ・ 🪵 +${PRODUCTION.lumber.timber} timber/turn ・
    🛍️ +${PRODUCTION.market.gold} gold & +${PRODUCTION.market.spices} spices/turn
  `;
  updateSelectedPanel();
}
function updateSelectedPanel() {
  const sel = state.selected.tileIndex;
  const t = sel != null ? state.tiles[sel] : null;
  document.getElementById("selectedTile").textContent =
    sel == null
      ? "ရွေးထားသော Tile: မရှိသေး"
      : `Tile (${t.x},${t.y}) – ${t.terrain} ${t.isCity ? "(City)" : ""} ${t.building ? "/ "+t.building : ""}`;
  document.getElementById("selectedUnit").textContent =
    sel == null || !t.unit
      ? "ရွေးထားသော စစ်သား: မရှိသေး"
      : `Unit: ${t.unit.type} (HP ${t.unit.hp}) – Owner ${PLAYERS[t.unit.owner].name}`;
}

// =================== INPUT & ACTIONS ====================
function mustBeMyTurn() {
  if (state.online.enabled && state.online.myPlayerId !== state.currentPlayer) {
    alert("Online Mode: ကိုယ့်တစ်ဝှမ်း မဟုတ်ပါ!");
    return false;
  }
  return true;
}
function onTileClick(index) {
  const t = state.tiles[index];
  const prev = state.selected.tileIndex;

  if (prev != null && prev !== index) {
    const from = state.tiles[prev];
    if (from.unit && from.unit.owner === state.currentPlayer) {
      if (!mustBeMyTurn()) return;
      tryMoveOrAttack(prev, index);
      state.selected.tileIndex = index;
      render(); pushOnlineState();
      return;
    }
  }
  state.selected.tileIndex = index;
  render();
}
function tryMoveOrAttack(fromIdx, toIdx) {
  const from = state.tiles[fromIdx];
  const to = state.tiles[toIdx];
  const unit = from.unit; if (!unit) return;

  const dist = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  const stats = UNIT_STATS[unit.type];
  if (dist > stats.move) return;

  const toIsSea = to.terrain === "water";
  const unitIsSea = stats.kind === "sea";
  if (toIsSea && !unitIsSea) return;
  if (!toIsSea && unitIsSea && to.terrain !== "city") return;

  if (to.unit && to.unit.owner !== unit.owner) {
    resolveCombat(unit, to.unit, toIdx);
    if (to.unit && to.unit.hp <= 0) to.unit = null;
    pushOnlineState();
    return;
  }
  if (to.isCity && to.owner !== unit.owner) {
    const enemyId = to.owner;
    PLAYERS[enemyId].capitalHP -= 1;
    alert(`⚔️ Siege! ရန်သူ Capital HP: ${PLAYERS[enemyId].capitalHP}`);
    if (PLAYERS[enemyId].capitalHP <= 0) alert(`🏁 အနိုင်: ${PLAYERS[unit.owner].name}`);
    pushOnlineState();
    return;
  }
  if (!to.unit) {
    to.unit = unit; from.unit = null;
    if (to.owner === null) to.owner = unit.owner;
  }
}
function resolveCombat(attacker, defender, toIdx) {
  const a = UNIT_STATS[attacker.type];
  const d = UNIT_STATS[defender.type];
  const rollA = a.atk + Math.floor(Math.random() * 3);
  const rollD = d.def + Math.floor(Math.random() * 3);
  const dmgToDef = Math.max(1, rollA - d.def);
  const dmgToAtt = Math.max(0, rollD - a.def);
  defender.hp -= dmgToDef;
  attacker.hp -= dmgToAtt;
  const toTile = state.tiles[toIdx];
  if (defender.hp <= 0) toTile.unit = attacker; // move into tile
}

function buildAt(index, type) {
  if (!mustBeMyTurn()) return;
  const t = state.tiles[index];
  const pid = state.currentPlayer;
  if (t.owner !== pid) return alert("ဤနေရာသည် မိမိ领土 မဟုတ်ပါ!");
  if (t.terrain === "water" && type !== "port") return alert("ရေပြင်ပေါ်တွင် Port သာတည်ဆောက်နိုင်!");
  if (t.building) return alert("ပြီးသားတည်ဆောက်ထားပြီး!");

  const cost = COSTS.build[type];
  if (!canAfford(pid, cost)) return alert("အရင်းအမြစ်မလုံလောက်!");
  payCost(pid, cost);
  t.building = type;
  render(); pushOnlineState();
}
function trainAt(index, unitType) {
  if (!mustBeMyTurn()) return;
  const t = state.tiles[index];
  const pid = state.currentPlayer;
  const cost = COSTS.train[unitType];
  const isSeaUnit = UNIT_STATS[unitType].kind === "sea";
  const required = isSeaUnit ? "port" : "barracks";
  if (t.owner !== pid) return alert("မိမိ领土 မဟုတ်ပါ!");
  if (t.building !== required) return alert(`ဤနေရာတွင် ${required} မရှိပါ!`);
  if (t.unit) return alert("ဤ Tile တွင် ယာယီစစ်သားရှိပြီး!");
  if (!canAfford(pid, cost)) return alert("အရင်းအမြစ်မလုံလောက်!");
  payCost(pid, cost);
  t.unit = { type: unitType, owner: pid, hp: 3 };
  render(); pushOnlineState();
}
function endTurn() {
  if (!mustBeMyTurn()) return;
  const pid = state.currentPlayer;
  const r = state.resources[pid];
  state.tiles.forEach((t) => {
    if (t.owner === pid && t.building) {
      const prod = PRODUCTION[t.building];
      if (prod) Object.entries(prod).forEach(([k, v]) => (r[k] += v));
    }
  });
  state.turn += 1;
  state.currentPlayer = (state.currentPlayer + 1) % PLAYERS.length;
  render(); pushOnlineState();
}

function canAfford(pid, cost) {
  const r = state.resources[pid];
  return Object.entries(cost).every(([k, v]) => r[k] >= v);
}
function payCost(pid, cost) {
  const r = state.resources[pid];
  Object.entries(cost).forEach(([k, v]) => (r[k] -= v));
}

// ===================== MULTIPLAYER (RTDB) ==============
function roomPath(code){ return `games/${code}`; }
function serializeState() {
  return {
    turn: state.turn,
    currentPlayer: state.currentPlayer,
    resources: state.resources,
    tiles: state.tiles,
    capitals: state.capitals,
    players: { p0: PLAYERS[0].capitalHP, p1: PLAYERS[1].capitalHP },
    lastUpdated: Date.now(),
  };
}
function applyRemote(snapshotVal) {
  if (!snapshotVal) return;
  state._applyingRemote = true;
  state.turn = snapshotVal.turn;
  state.currentPlayer = snapshotVal.currentPlayer;
  state.resources = snapshotVal.resources;
  state.tiles = snapshotVal.tiles;
  PLAYERS[0].capitalHP = snapshotVal.players?.p0 ?? PLAYERS[0].capitalHP;
  PLAYERS[1].capitalHP = snapshotVal.players?.p1 ?? PLAYERS[1].capitalHP;
  state._applyingRemote = false;
  render();
}
function pushOnlineState(force=false) {
  if (!state.online.enabled || !db) return;
  // cooldown to avoid flooding
  const now = Date.now();
  if (!force && now - state.online.lastPush < 150) return;
  state.online.lastPush = now;
  const code = state.online.roomCode;
  db.ref(roomPath(code)).update(serializeState()).catch(console.error);
}

async function createRoom() {
  const code = document.getElementById("roomCode").value.trim();
  const name = document.getElementById("playerName").value.trim() || "Player";
  if (!code) return alert("Room Code ထည့်ပါ");

  state.online.enabled = true; state.online.roomCode = code; state.online.myName = name;
  setConnStatus("Connecting...");
  // init map with code seed
  resetGame(false, code);

  // write initial bundle
  await db.ref(roomPath(code)).set({
    ...serializeState(),
    meta: { p0: name, p1: null }
  });
  state.online.myPlayerId = 0;
  setConnStatus("Online (Host)"); setRoleInfo();

  // listen
  listenRoom(code);
}

function listenRoom(code) {
  db.ref(roomPath(code)).on("value", (snap) => {
    const val = snap.val();
    if (!val) return;
    applyRemote(val);
    // update meta role text
    const roleEl = document.getElementById("roleInfo");
    const meta = val.meta || {};
    roleEl.textContent = `Role: ${state.online.myPlayerId===0?"Player 0":"Player 1/Spectator"} | P0=${meta.p0||"-"} | P1=${meta.p1||"-"}`;
  });
}

async function joinRoom() {
  const code = document.getElementById("roomCode").value.trim();
  const name = document.getElementById("playerName").value.trim() || "Player";
  if (!code) return alert("Room Code ထည့်ပါ");
  state.online.enabled = true; state.online.roomCode = code; state.online.myName = name;
  setConnStatus("Connecting...");

  // load room
  const snap = await db.ref(roomPath(code)).get();
  const val = snap.val();
  if (!val) {
    alert("Room မရှိပါ! Host တစ်ယောက် Create Room လုပ်ပါ");
    setConnStatus("Offline"); state.online.enabled = false; return;
  }
  applyRemote(val);
  // assign role
  const metaRef = db.ref(roomPath(code) + "/meta");
  const metaSnap = await metaRef.get();
  const meta = metaSnap.val() || {};
  if (!meta.p1) { // take player 1 slot
    await metaRef.update({ p1: name });
    state.online.myPlayerId = 1;
  } else {
    state.online.myPlayerId = null; // spectator
  }
  setConnStatus(state.online.myPlayerId==null ? "Online (Spectator)" : "Online (Joined)");
  setRoleInfo();

  listenRoom(code);
}

async function leaveRoom() {
  const code = state.online.roomCode;
  if (!code || !db) return;
  const metaRef = db.ref(roomPath(code) + "/meta");
  const metaSnap = await metaRef.get();
  const meta = metaSnap.val() || {};
  if (state.online.myPlayerId === 0) await metaRef.update({ p0: null });
  else if (state.online.myPlayerId === 1) await metaRef.update({ p1: null });

  db.ref(roomPath(code)).off(); // stop listening
  state.online.enabled = false; state.online.roomCode = null; state.online.myPlayerId = null;
  setConnStatus("Offline"); setRoleInfo();
}

// ======================= DATA (Save/Load) ===============
function saveLocal() {
  const json = JSON.stringify(serializeState());
  localStorage.setItem("tunti-save", json);
  alert("LocalStorage သို့ သိမ်းပြီး!");
}
function loadLocal() {
  const json = localStorage.getItem("tunti-save");
  if (!json) return alert("LocalStorage မှာ Save မရှိပါ!");
  const val = JSON.parse(json);
  applyRemote(val);
  alert("LocalStorage မှ Load လုပ်ပြီး!");
}
function exportJSON() {
  const blob = new Blob([JSON.stringify(serializeState(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `tunti-save-${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
}
function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const val = JSON.parse(reader.result);
      applyRemote(val);
      alert("JSON Import လုပ်ပြီး!");
    } catch (e) { alert("JSON ဖိုင်မမှန်ပါ။"); }
  };
  reader.readAsText(file);
}

// ====================== RESET / BOOT ====================
function resetGame(showAlert=true, seedStr=null) {
  state.turn = 0; state.currentPlayer = 0;
  PLAYERS[0].capitalHP = 5; PLAYERS[1].capitalHP = 5;
  state.resources = [
    { rice: 100, gold: 100, timber: 100, spices: 0 },
    { rice: 100, gold: 100, timber: 100, spices: 0 },
  ];
  state.selected.tileIndex = null;
  initMap(seedStr || "tunti-local");
  render();
  if (showAlert) alert("Game Reset!");
}
function bindUI() {
  document.querySelectorAll("[data-build]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-build");
      const sel = state.selected.tileIndex; if (sel == null) return alert("တည်ဆောက်ရန် Tile ရွေးပါ");
      buildAt(sel, type);
    });
  });
  document.querySelectorAll("[data-train]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-train");
      const sel = state.selected.tileIndex; if (sel == null) return alert("သင်ကြားရန် Barracks/Port Tile ကို ရွေးပါ");
      trainAt(sel, type);
    });
  });
  document.getElementById("endTurn").addEventListener("click", endTurn);
  document.getElementById("resetGame").addEventListener("click", () => resetGame());
  // Multiplayer buttons
  document.getElementById("createRoom").addEventListener("click", createRoom);
  document.getElementById("joinRoom").addEventListener("click", joinRoom);
  document.getElementById("leaveRoom").addEventListener("click", leaveRoom);
  // Data
  document.getElementById("saveLocal").addEventListener("click", saveLocal);
  document.getElementById("loadLocal").addEventListener("click", loadLocal);
  document.getElementById("exportJSON").addEventListener("click", exportJSON);
  document.getElementById("importJSON").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (file) importJSONFile(file);
    e.target.value = "";
  });
}

// Boot
initFirebase();
resetGame(false);
bindUI();
render();
