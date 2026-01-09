
/* Tunti – Web Prototype (Offline Multiplayer + AI + Custom Map Editor)
 * Language: မြန်မာ UI
 * Author: You + Copilot
 *
 * Notes:
 * - Online/Firebase မလိုပါ: Offline hot-seat အတွက်သာ optimize လုပ်ထားသည်
 * - Player 1 ကို AI သို့မဟုတ် Human အဖြစ် toggle လုပ်နိုင်
 * - Custom Map Editor: tile painting (terrain/city/owner), localStorage save/load, JSON export/import
 */

/* ====================== SETTINGS ====================== */
const SETTINGS = {
  width: 18,
  height: 12,
  aiEnabled: { 0: false, 1: true }, // Player 0 human, Player 1 AI
  aiDifficulty: "normal", // "easy" | "normal" | "hard" (heuristic intensity)
  defaultSeed: "tunti-local", // default procedural map seed
  allowEditor: true,          // enable custom map editor
};

/* ==================== CONSTANTS/UI ==================== */
const WIDTH = SETTINGS.width;
const HEIGHT = SETTINGS.height;

const EMOJI = {
  plains: "🟩",
  forest: "🌲",
  mountain: "⛰️",
  water: "🌊",
  city: "🏛️",
  pagoda: "🛕",  // Myanmar landmark (capital badge)
  palace: "🏯",  // Thailand landmark (capital badge)
  farm: "🌾",
  lumber: "🪵",
  market: "🛍️",
  barracks: "⚔️",
  port: "⚓",
  infantry: "🛡️",
  archer: "🏹",
  cavalry: "🐎",
  ship: "⛵",
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
    archer:   { timber: 10, gold: 15 },
    cavalry:  { rice: 20, gold: 30 },
    ship:     { timber: 40, gold: 20 },
  },
};

const PRODUCTION = {
  farm:   { rice: 8 },
  lumber: { timber: 6 },
  market: { gold: 6, spices: 2 },
};

const UNIT_STATS = {
  infantry: { atk: 2, def: 2, move: 1, kind: "land" },
  archer:   { atk: 3, def: 1, move: 1, kind: "land" },
  cavalry:  { atk: 3, def: 2, move: 2, kind: "land" },
  ship:     { atk: 3, def: 2, move: 2, kind: "sea" },
};

/* =================== DETERMINISTIC RNG =================== */
function mulberry32(a){
  return function(){
    a+=0x6D2B79F5; let t=a;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function strToSeed(s){
  let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}

/* ========================= STATE ========================= */
let state = {
  turn: 0,
  currentPlayer: 0,
  resources: [
    { rice: 100, gold: 100, timber: 100, spices: 0 },
    { rice: 100, gold: 100, timber: 100, spices: 0 },
  ],
  tiles: [], // {x,y,terrain,building:null|type,owner:null|pid,unit:null|{type,owner,hp},isCity:false}
  capitals: [
    { x: 4, y: 8, owner: 0 },   // Yangon/Dagon approx
    { x: 12, y: 6, owner: 1 },  // Bangkok approx
  ],
  selected: { tileIndex: null },
  aiProcessing: false,

  // Editor
  editor: {
    enabled: false,
    paint: "plains", // plains|forest|mountain|water|city
    owner: 0,        // used when painting city owner
  },
};

/* ====================== MAP INIT ====================== */
function initMap(seedStr = SETTINGS.defaultSeed) {
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
  // river (decorative & blocking for land)
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
  // initial territory
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

/* ========================= RENDER ========================= */
function render() {
  const mapEl = document.getElementById("map");
  if (mapEl) {
    mapEl.innerHTML = "";
    state.tiles.forEach((t, i) => {
      const tile = document.createElement("div");
      const cls = ["tile", t.terrain];
      if (t.owner !== null) cls.push(`own-${t.owner}`);
      if (state.selected.tileIndex === i) cls.push("selected");
      if (t.isCity) cls.push("city");
      tile.className = cls.join(" ");
      tile.title = `(${t.x},${t.y}) ${t.terrain}${t.owner !== null ? " / "+PLAYERS[t.owner].name:""}${state.editor.enabled ? " (Editor)" : ""}`;

      // badge
      const badge = document.createElement("div");
      badge.className = "badge";
      if (t.isCity) badge.textContent = EMOJI.city + " City";
      else if (t.building) badge.textContent = (EMOJI[t.building] || "🏗️") + " " + t.building;
      tile.appendChild(badge);

      // owner ring
      const ring = document.createElement("div"); ring.className = "owner-ring"; tile.appendChild(ring);

      // unit
      const unitEl = document.createElement("div"); unitEl.className = "unit";
      unitEl.textContent = t.unit ? (EMOJI[t.unit.type] + " HP:" + t.unit.hp) : "";
      tile.appendChild(unitEl);

      // events
      tile.addEventListener("click", (ev) => onTileClick(i, ev));
      tile.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        onTileRightClick(i);
      });

      mapEl.appendChild(tile);
    });
  }

  const turnInfo = document.getElementById("turnInfo");
  if (turnInfo) {
    const who = state.aiProcessing
      ? `${PLAYERS[state.currentPlayer].name} (AI)`
      : PLAYERS[state.currentPlayer].name;
    turnInfo.textContent = `လက်ရှိတစ်ဝှမ်း: Turn ${state.turn} – ${who}`;
  }

  const resEl = document.getElementById("resources");
  const r = state.resources[state.currentPlayer];
  if (resEl) resEl.textContent =
    `အရင်းအမြစ်: 🌾 ${r.rice} | 🪵 ${r.timber} | 🛍️ ${r.spices} | 💰 ${r.gold}`;

  const kInfo = document.getElementById("kingdomInfo");
  if (kInfo) kInfo.innerHTML = `
    <strong>${PLAYERS[0].name}</strong> Capital HP: ${PLAYERS[0].capitalHP}<br/>
    <strong>${PLAYERS[1].name}</strong> Capital HP: ${PLAYERS[1].capitalHP}
  `;

  const prodEl = document.getElementById("productionInfo");
  if (prodEl) prodEl.innerHTML = `
    🌾 +${PRODUCTION.farm.rice} rice/turn ・ 🪵 +${PRODUCTION.lumber.timber} timber/turn ・
    🛍️ +${PRODUCTION.market.gold} gold & +${PRODUCTION.market.spices} spices/turn
  `;

  updateSelectedPanel();
}

function updateSelectedPanel() {
  const sel = state.selected.tileIndex;
  const t = sel != null ? state.tiles[sel] : null;
  const selTileEl = document.getElementById("selectedTile");
  const selUnitEl = document.getElementById("selectedUnit");

  if (selTileEl) selTileEl.textContent =
    sel == null
      ? "ရွေးထားသော Tile: မရှိသေး"
      : `Tile (${t.x},${t.y}) – ${t.terrain} ${t.isCity ? "(City)" : ""} ${t.building ? "/ "+t.building : ""} ${t.owner!=null ? " / Owner "+PLAYERS[t.owner].name : ""}`;

  if (selUnitEl) selUnitEl.textContent =
    sel == null || !t.unit
      ? "ရွေးထားသော စစ်သား: မရှိသေး"
      : `Unit: ${t.unit.type} (HP ${t.unit.hp}) – Owner ${PLAYERS[t.unit.owner].name}`;
}

/* ===================== EDITOR HANDLERS ===================== */
function onTileClick(index, ev) {
  const t = state.tiles[index];

  if (state.editor.enabled) {
    // Paint terrain/city
    if (state.editor.paint === "city") {
      t.terrain = "city";
      t.isCity = true;
      t.owner = state.editor.owner;
      t.building = t.owner === 0 ? "pagoda" : "palace";
      // update capitals list (ensure one per player if desired)
      const cap = state.capitals.find(c => c.owner === state.editor.owner);
      if (cap) { cap.x = t.x; cap.y = t.y; } else { state.capitals.push({ x: t.x, y: t.y, owner: state.editor.owner }); }
    } else {
      t.terrain = state.editor.paint;
      if (t.isCity) { t.isCity = false; t.building = null; t.owner = null; }
    }
    state.selected.tileIndex = index;
    render();
    return;
  }

  // Normal mode: select or move/attack
  const prev = state.selected.tileIndex;
  if (prev != null && prev !== index) {
    const from = state.tiles[prev];
    if (from.unit && from.unit.owner === state.currentPlayer) {
      if (!canActNow()) return;
      tryMoveOrAttack(prev, index);
      state.selected.tileIndex = index;
      render();
      return;
    }
  }

  state.selected.tileIndex = index;
  render();
}

function onTileRightClick(index) {
  // Editor: right-click to cycle owner (None -> 0 -> 1 -> None)
  if (!state.editor.enabled) return;
  const t = state.tiles[index];
  if (t.terrain !== "city") return;
  const next = t.owner == null ? 0 : (t.owner + 1) % PLAYERS.length;
  t.owner = next;
  t.building = next === 0 ? "pagoda" : "palace";
  const cap = state.capitals.find(c => c.x === t.x && c.y === t.y);
  if (cap) cap.owner = next;
  render();
}

/* ======================= ACTIONS ======================= */
function canActNow(){
  if (state.aiProcessing) { alert("AI တစ်ဝှမ်းဆောင်ရွက်နေပါသည်…"); return false; }
  return true; // Offline: turn-lock is only AI processing
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

  // combat
  if (to.unit && to.unit.owner !== unit.owner) {
    resolveCombat(unit, to.unit, toIdx);
    if (to.unit && to.unit.hp <= 0) to.unit = null;
    return;
  }

  // siege
  if (to.isCity && to.owner !== unit.owner) {
    const enemyId = to.owner;
    PLAYERS[enemyId].capitalHP -= 1;
    alert(`⚔️ Siege! ရန်သူ Capital HP: ${PLAYERS[enemyId].capitalHP}`);
    if (PLAYERS[enemyId].capitalHP <= 0) alert(`🏁 အနိုင်: ${PLAYERS[unit.owner].name}`);
    return;
  }

  // move
  if (!to.unit) {
    to.unit = unit; from.unit = null;
    if (to.owner === null && to.terrain !== "water") to.owner = unit.owner;
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
  if (!canActNow()) return;
  const t = state.tiles[index];
  const pid = state.currentPlayer;
  if (t.owner !== pid) return alert("ဤနေရာသည် မိမိ领土 မဟုတ်ပါ!");
  if (t.terrain === "water" && type !== "port") return alert("ရေပြင်ပေါ်တွင် Port သာတည်ဆောက်နိုင်!");
  if (t.building) return alert("ပြီးသားတည်ဆောက်ထားပြီး!");

  const cost = COSTS.build[type];
  if (!canAfford(pid, cost)) return alert("အရင်းအမြစ်မလုံလောက်!");
  payCost(pid, cost);
  t.building = type;
  render();
}

function trainAt(index, unitType) {
  if (!canActNow()) return;
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
  render();
}

function endTurn() {
  if (!canActNow()) return;
  const pid = state.currentPlayer;
  const r = state.resources[pid];
  // production
  state.tiles.forEach((t) => {
    if (t.owner === pid && t.building) {
      const prod = PRODUCTION[t.building];
      if (prod) Object.entries(prod).forEach(([k, v]) => (r[k] += v));
    }
  });
  // switch turn
  state.turn += 1;
  state.currentPlayer = (state.currentPlayer + 1) % PLAYERS.length;
  render();

  // If next player is AI, run AI turn automatically
  const nextPid = state.currentPlayer;
  if (SETTINGS.aiEnabled[nextPid]) {
    runAITurn(nextPid);
  }
}

/* ===================== ECONOMY HELPERS ===================== */
function canAfford(pid, cost) {
  const r = state.resources[pid];
  return Object.entries(cost).every(([k, v]) => r[k] >= v);
}
function payCost(pid, cost) {
  const r = state.resources[pid];
  Object.entries(cost).forEach(([k, v]) => (r[k] -= v));
}

/* ========================= AI LOGIC =========================
 * Heuristic:
 * - Build order priority (depends on difficulty)
 * - Train unit when barracks/port available
 * - Move units towards enemy capital (simple step)
 * - Try siege if adjacent
 */
function runAITurn(pid) {
  state.aiProcessing = true;
  render();

  setTimeout(() => {
    const diff = SETTINGS.aiDifficulty;
    const buildOrder = diff === "easy" ? ["farm", "lumber", "market"] :
                       diff === "hard" ? ["barracks", "farm", "market", "lumber"] :
                                         ["farm", "market", "lumber", "barracks"];

    // Build
    for (const type of buildOrder) {
      const ownTiles = state.tiles.filter(
        (t) => t.owner === pid && !t.building && (t.terrain !== "water" || type === "port")
      );
      // Prefer plains for farms, forest for lumber, city-adjacent for market
      let candidates = ownTiles;
      if (type === "farm") candidates = ownTiles.filter(t => t.terrain === "plains");
      if (type === "lumber") candidates = ownTiles.filter(t => t.terrain === "forest");
      if (type === "market") candidates = ownTiles.filter(t => !t.isCity && t.terrain !== "water");
      if (candidates.length && canAfford(pid, COSTS.build[type])) {
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        payCost(pid, COSTS.build[type]);
        target.building = type;
        break;
      }
    }

    // Train unit
    const barracksTiles = state.tiles.filter(
      (t) => t.owner === pid && t.building === "barracks" && !t.unit
    );
    const portTiles = state.tiles.filter(
      (t) => t.owner === pid && t.building === "port" && !t.unit
    );
    // Choose unit
    const unitOrder = diff === "hard" ? ["cavalry", "archer", "infantry"] : ["infantry", "archer", "cavalry"];
    for (const u of unitOrder) {
      const req = UNIT_STATS[u].kind === "sea" ? portTiles : barracksTiles;
      if (req.length && canAfford(pid, COSTS.train[u])) {
        const tile = req[Math.floor(Math.random() * req.length)];
        tile.unit = { type: u, owner: pid, hp: 3 };
        payCost(pid, COSTS.train[u]);
        break;
      }
    }

    // Move units towards enemy capital
    const enemyCap = state.capitals.find(c => c.owner !== pid) || state.capitals[0];
    const stepUnits = state.tiles
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => t.unit && t.unit.owner === pid);

    stepUnits.forEach(({ t, idx }) => {
      const dx = Math.sign(enemyCap.x - t.x);
      const dy = Math.sign(enemyCap.y - t.y);
      // try move in x, then y
      const tryTargets = [];
      if (dx !== 0) tryTargets.push({ x: t.x + dx, y: t.y });
      if (dy !== 0) tryTargets.push({ x: t.x, y: t.y + dy });
      // also try diagonal if allowed by move range
      tryTargets.push({ x: t.x + dx, y: t.y + dy });

      for (const nt of tryTargets) {
        const nx = nt.x, ny = nt.y;
        if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
        const nIdx = ny * WIDTH + nx;
        tryMoveOrAttack(idx, nIdx);
        // break after first successful attempt
        break;
      }
    });

    // End AI turn → give control back to next human/AI
    state.aiProcessing = false;
    render();
    // finish turn automatically so game flows (AI often ends turn)
    // If you prefer manual, comment following two lines:
    state.turn += 1;
    state.currentPlayer = (state.currentPlayer + 1) % PLAYERS.length;
    render();
    // If next is AI again (AI vs AI), chain:
    if (SETTINGS.aiEnabled[state.currentPlayer]) runAITurn(state.currentPlayer);
  }, 350);
}

/* ====================== DATA (Map/Game) ====================== */
// Save whole game state (for Load Game)
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
function applySerialized(val) {
  if (!val) return;
  state.turn = val.turn ?? state.turn;
  state.currentPlayer = val.currentPlayer ?? state.currentPlayer;
  state.resources = val.resources ?? state.resources;
  state.tiles = val.tiles ?? state.tiles;
  state.capitals = val.capitals ?? state.capitals;
  PLAYERS[0].capitalHP = val.players?.p0 ?? PLAYERS[0].capitalHP;
  PLAYERS[1].capitalHP = val.players?.p1 ?? PLAYERS[1].capitalHP;
  state.selected.tileIndex = null;
  render();
}

// Save/Load Game
function saveLocalGame() {
  localStorage.setItem("tunti-save", JSON.stringify(serializeState()));
  alert("Game ကို LocalStorage သို့ သိမ်းပြီး!");
}
function loadLocalGame() {
  const json = localStorage.getItem("tunti-save");
  if (!json) return alert("LocalStorage မှာ Game Save မရှိပါ!");
  applySerialized(JSON.parse(json));
  alert("Game ကို LocalStorage မှ Load လုပ်ပြီး!");
}
function exportGameJSON() {
  const blob = new Blob([JSON.stringify(serializeState(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `tunti-game-${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
}
function importGameJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try { applySerialized(JSON.parse(reader.result)); alert("Game JSON Import လုပ်ပြီး!"); }
    catch (e) { alert("JSON ဖိုင်မမှန်ပါ။"); }
  };
  reader.readAsText(file);
}

// Save/Load Map (Editor)
function serializeMapOnly() {
  return {
    width: WIDTH, height: HEIGHT,
    tiles: state.tiles.map(t => ({
      x: t.x, y: t.y, terrain: t.terrain,
      isCity: t.isCity, owner: t.owner,
      building: t.building,
    })),
    capitals: state.capitals,
  };
}
function applyMapOnly(val) {
  if (!val || !val.tiles) return;
  // Resize not supported in this prototype; expect same WIDTH/HEIGHT
  state.tiles = val.tiles.map(t => ({
    x: t.x, y: t.y, terrain: t.terrain,
    building: t.building ?? null,
    owner: t.owner ?? null,
    unit: null, // clear units when loading map
    isCity: !!t.isCity,
  }));
  state.capitals = (val.capitals && val.capitals.length) ? val.capitals : state.capitals;
  // Reset basic game stats on new map
  state.turn = 0; state.currentPlayer = 0;
  PLAYERS[0].capitalHP = 5; PLAYERS[1].capitalHP = 5;
  state.resources = [
    { rice: 100, gold: 100, timber: 100, spices: 0 },
    { rice: 100, gold: 100, timber: 100, spices: 0 },
  ];
  state.selected.tileIndex = null;
  render();
}

function saveLocalMap() {
  localStorage.setItem("tunti-map", JSON.stringify(serializeMapOnly()));
  alert("Map ကို LocalStorage သို့ သိမ်းပြီး!");
}
function loadLocalMap() {
  const json = localStorage.getItem("tunti-map");
  if (!json) return alert("LocalStorage မှာ Map Save မရှိပါ!");
  applyMapOnly(JSON.parse(json));
  alert("Map ကို LocalStorage မှ Load လုပ်ပြီး!");
}
function exportMapJSON() {
  const blob = new Blob([JSON.stringify(serializeMapOnly(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `tunti-map-${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
}
function importMapJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try { applyMapOnly(JSON.parse(reader.result)); alert("Map JSON Import လုပ်ပြီး!"); }
    catch (e) { alert("Map JSON ဖိုင်မမှန်ပါ။"); }
  };
  reader.readAsText(file);
}

/* ====================== RESET / BOOT ====================== */
function resetGame(showAlert=true, seedStr=null) {
  state.turn = 0; state.currentPlayer = 0;
  PLAYERS[0].capitalHP = 5; PLAYERS[1].capitalHP = 5;
  state.resources = [
    { rice: 100, gold: 100, timber: 100, spices: 0 },
    { rice: 100, gold: 100, timber: 100, spices: 0 },
  ];
  state.selected.tileIndex = null;
  initMap(seedStr || SETTINGS.defaultSeed);
  render();
  if (showAlert) alert("Game Reset!");
}

/* ====================== EDITOR TOGGLES ====================== */
function toggleEditor() {
  if (!SETTINGS.allowEditor) return alert("Editor မဖွင့်ထားပါ!");
  state.editor.enabled = !state.editor.enabled;
  const status = state.editor.enabled ? "ON" : "OFF";
  alert(`Map Editor: ${status}`);
  render();
}
function setEditorPaint(type) {
  state.editor.paint = type; // plains|forest|mountain|water|city
  alert(`Editor Paint: ${type}`);
}
function swapEditorOwner() {
  state.editor.owner = (state.editor.owner + 1) % PLAYERS.length;
  alert(`City Owner: ${PLAYERS[state.editor.owner].name}`);
}

/* ========================== UI BIND ========================== */
function bindUI() {
  // Build buttons
  document.querySelectorAll("[data-build]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-build");
      const sel = state.selected.tileIndex; if (sel == null) return alert("တည်ဆောက်ရန် Tile ရွေးပါ");
      buildAt(sel, type);
    });
  });

  // Train buttons
  document.querySelectorAll("[data-train]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-train");
      const sel = state.selected.tileIndex; if (sel == null) return alert("သင်ကြားရန် Barracks/Port Tile ကို ရွေးပါ");
      trainAt(sel, type);
    });
  });

  // Core actions
  const endBtn = document.getElementById("endTurn");
  if (endBtn) endBtn.addEventListener("click", endTurn);
  const resetBtn = document.getElementById("resetGame");
  if (resetBtn) resetBtn.addEventListener("click", () => resetGame());

  // Optional: manual role take (hot-seat UX)
  const takeP0 = document.getElementById("takeP0");
  if (takeP0) takeP0.addEventListener("click", () => { SETTINGS.aiEnabled[0] = false; alert("Player 0 ကို Human အဖြစ်ယူပြီး!"); render(); });
  const takeP1 = document.getElementById("takeP1");
  if (takeP1) takeP1.addEventListener("click", () => { SETTINGS.aiEnabled[1] = false; alert("Player 1 ကို Human အဖြစ်ယူပြီး!"); render(); });

  // Editor controls (optional buttons if present)
  const tgl = document.getElementById("toggleEditor"); if (tgl) tgl.addEventListener("click", toggleEditor);
  const saveMapBtn = document.getElementById("saveMap"); if (saveMapBtn) saveMapBtn.addEventListener("click", saveLocalMap);
  const loadMapBtn = document.getElementById("loadMap"); if (loadMapBtn) loadMapBtn.addEventListener("click", loadLocalMap);
  const exportMapBtn = document.getElementById("exportMap"); if (exportMapBtn) exportMapBtn.addEventListener("click", exportMapJSON);
  const importMapInput = document.getElementById("importMap");
  if (importMapInput) importMapInput.addEventListener("change", (e) => {
    const file = e.target.files[0]; if (file) importMapJSON(file);
    e.target.value = "";
  });

  // Game data save/load/export/import (optional IDs)
  const sv = document.getElementById("saveLocal"); if (sv) sv.addEventListener("click", saveLocalGame);
  const ld = document.getElementById("loadLocal"); if (ld) ld.addEventListener("click", loadLocalGame);
  const ex = document.getElementById("exportJSON"); if (ex) ex.addEventListener("click", exportGameJSON);
  const im = document.getElementById("importJSON");
  if (im) im.addEventListener("change", (e) => {
    const file = e.target.files[0]; if (file) importGameJSON(file);
    e.target.value = "";
  });

  // Keyboard shortcuts for Editor
  window.addEventListener("keydown", (ev) => {
    if (!state.editor.enabled) return;
    if (ev.key === "1") setEditorPaint("plains");
    if (ev.key === "2") setEditorPaint("forest");
    if (ev.key === "3") setEditorPaint("mountain");
    if (ev.key === "4") setEditorPaint("water");
    if (ev.key === "5") setEditorPaint("city");
    if (ev.key.toLowerCase() === "o") swapEditorOwner();
  });
}

/* =========================== BOOT =========================== */
resetGame(false);
bindUI();
render();
