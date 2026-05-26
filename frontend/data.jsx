// ===================================================================
// Dados mockados — DayZ Brasil Reforger
// Substituir por API quando disponível
// ===================================================================

const WEAPONS_PVP = [
  "AK-74", "AKM", "AK-101", "M16A2", "M4A1", "RPK-74",
  "Mosin M44", "Mosin M91/30", "SVD Dragunov", "MP5",
  "M9 Beretta", "Makarov PM", "Glock 17", "Sa vz. 58", "PKM",
];

const WEAPONS_PVE = [
  "Machado", "Faca de Caça", "AK-74", "Mosin M44", "AKM",
  "Espingarda", "M9 Beretta", "Pé de Cabra", "Bastão", "M4A1",
];

const FAV_WEAPONS = ["AKM", "AK-74", "Mosin M91/30", "SVD Dragunov", "M4A1", "M16A2", "RPK-74", "PKM", "MP5", "Glock 17"];

const BR_NICKS = [
  "Capivara_Tatica", "ZéDaSelva", "MatadorDoCerrado", "FavelaSniper",
  "BrunoTáctico", "MalokeiroBR", "CearaWolf", "FúriaBR",
  "LampiaoReboot", "AlemaoTaTico", "MineiroLoko", "CangaceiroX",
  "VovoMatadora", "PortoSeguroBR", "KamikazeBR", "TioPatinhas",
  "ResistenciaBR", "LobisomemBR", "TaubateBoy", "SaoPauloKid",
  "MatutoArmado", "MestreCuca_BR", "Pavão_Misterioso", "Z3_Brasil",
  "NorteBravo", "PantaneiroFurtivo", "GauchoSilencioso", "AmazonGhost",
];

const NPC_TYPES = ["Bandido", "Bandido", "Bandido", "Zumbi", "Zumbi", "Zumbi", "Zumbi", "Saqueador", "Infectado"];

const LOCATIONS = [
  "Chernogorsk", "Elektrozavodsk", "Berezino", "Krasnostav", "Cherno Sul",
  "Stary Sobor", "Polana", "Vybor", "Severograd", "Novodmitrovsk",
  "Solnichniy", "Kamyshovo", "Pavlovo Base", "NW Airfield", "Tisy Military",
];

const REGIONS = ["SP", "RJ", "MG", "BA", "RS", "PR", "PE", "CE", "GO", "AM", "PA", "SC", "DF"];

// Helpers ------------------------------------------------------------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

// Gera uma lista determinística de top 10 dado uma "seed" de período
function buildRanking(seedMul, mode) {
  // Sort estável-mas-variado por seed (Math.sin entrega valores estáveis dado i)
  const pool = BR_NICKS
    .map((n, i) => ({ n, k: Math.sin((i + 1) * seedMul) * 1000 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.n);

  return pool.map((nick, i) => {
    const factor = 1 + (10 - i) * 0.18;
    const kills = Math.round((mode === "pve" ? 240 : 95) * factor * (0.85 + 0.3 * Math.abs(Math.sin((i + 1) * seedMul))));
    const deaths = Math.max(1, Math.round((mode === "pve" ? 14 : 22) * (1.2 - i * 0.05) * (0.8 + 0.4 * Math.abs(Math.cos((i + 1) * seedMul)))));
    const kd = +(kills / deaths).toFixed(2);
    const aliveMin = Math.round((mode === "pve" ? 380 : 290) * factor * (0.9 + 0.2 * Math.abs(Math.sin(i + seedMul))));
    const headshots = Math.round(kills * (0.18 + 0.25 * Math.abs(Math.sin(i * seedMul + 1))));
    const headshotPct = Math.round((headshots / kills) * 100);
    return {
      rank: i + 1,
      nick,
      kills,
      deaths,
      kd,
      aliveMin,
      headshotPct,
      favWeapon: FAV_WEAPONS[Math.floor(Math.abs(Math.sin(i * seedMul + 7)) * FAV_WEAPONS.length) % FAV_WEAPONS.length],
      region: REGIONS[Math.floor(Math.abs(Math.cos(i * seedMul + 3)) * REGIONS.length) % REGIONS.length],
      longestShot: { dist: randInt(180, 1240), weapon: pick(WEAPONS_PVP) },
    };
  });
}

function formatAlive(min) {
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const RANKINGS = {
  daily:   { pvp: buildRanking(1.7, "pvp"), pve: buildRanking(2.3, "pve") },
  weekly:  { pvp: buildRanking(3.1, "pvp"), pve: buildRanking(4.5, "pve") },
  monthly: { pvp: buildRanking(5.9, "pvp"), pve: buildRanking(6.7, "pve") },
};

function buildHighlights(seed, mode) {
  const ranking = RANKINGS[seed][mode];
  const longest = [...ranking].sort((a, b) => b.longestShot.dist - a.longestShot.dist)[0];
  const survivor = [...ranking].sort((a, b) => b.aliveMin - a.aliveMin)[0];
  return {
    longestShot: {
      nick: longest.nick,
      region: longest.region,
      dist: longest.longestShot.dist + randInt(80, 420),
      weapon: longest.longestShot.weapon,
      location: pick(LOCATIONS),
    },
    longestAlive: {
      nick: survivor.nick,
      region: survivor.region,
      aliveMin: survivor.aliveMin + randInt(40, 200),
      location: pick(LOCATIONS),
    },
  };
}

const HIGHLIGHTS = {
  daily:   { pvp: buildHighlights("daily", "pvp"),   pve: buildHighlights("daily", "pve") },
  weekly:  { pvp: buildHighlights("weekly", "pvp"),  pve: buildHighlights("weekly", "pve") },
  monthly: { pvp: buildHighlights("monthly", "pvp"), pve: buildHighlights("monthly", "pve") },
};

// Kill Feed ---------------------------------------------------------
function makeKillEvent(minutesAgo) {
  const isPvE = Math.random() < 0.45;
  const killer = pick(BR_NICKS);
  let victim, weapon, dist, type;
  if (isPvE) {
    type = "pve";
    victim = pick(NPC_TYPES);
    weapon = pick(WEAPONS_PVE);
    dist = randInt(3, 180);
  } else {
    type = "pvp";
    do { victim = pick(BR_NICKS); } while (victim === killer);
    weapon = pick(WEAPONS_PVP);
    dist = randInt(8, 720);
  }
  return {
    id: Math.random().toString(36).slice(2, 9),
    type,
    killer,
    victim,
    weapon,
    dist,
    location: pick(LOCATIONS),
    minutesAgo,
    headshot: Math.random() < 0.22,
  };
}

function seedKillFeed() {
  const events = [];
  let acc = 0;
  for (let i = 0; i < 16; i++) {
    acc += randInt(0, 5);
    events.push(makeKillEvent(acc));
  }
  return events;
}

// Safezone --------------------------------------------------------
const SAFEZONE_ITEMS = [
  "M4A1", "AKM", "SVD", "M16A2", "Mosin", "Mira ACOG", "Colete Pesado",
  "Capacete Tático", "Kit Médico", "Munição 7.62", "Munição 5.56",
  "Camuflagem Ghillie", "Gerador", "Veículo Olga", "Veículo M3S",
  "Granada", "C4", "Lanterna Tática",
];

function formatBRL(value) {
  return "R$ " + value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildSafezone(seedMul) {
  const sellerPool = BR_NICKS
    .map((n, i) => ({ n, k: Math.sin((i + 1) * seedMul + 11) * 1000 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.n);
  const buyerPool = BR_NICKS
    .map((n, i) => ({ n, k: Math.cos((i + 1) * seedMul + 7) * 1000 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.n);

  const sellerBase  = 18000 + Math.round(Math.abs(Math.sin(seedMul)) * 120000);
  const buyerBase   = 14000 + Math.round(Math.abs(Math.cos(seedMul)) * 95000);

  const topItem = (n, base) => Array.from({ length: 3 }).map((_, i) => ({
    name: SAFEZONE_ITEMS[Math.floor(Math.abs(Math.sin(i + seedMul * (n + 1))) * SAFEZONE_ITEMS.length)],
    qty: randInt(1, 14),
  }));

  return {
    seller: {
      nick: sellerPool[0],
      total: sellerBase,
      transactions: randInt(28, 220),
      topItems: topItem(1, sellerBase),
    },
    buyer: {
      nick: buyerPool[0],
      total: buyerBase,
      transactions: randInt(22, 190),
      topItems: topItem(2, buyerBase),
    },
  };
}

const SAFEZONE = {
  daily:   buildSafezone(2.1),
  weekly:  buildSafezone(4.7),
  monthly: buildSafezone(6.3),
};

window.GAME_DATA = {
  RANKINGS,
  HIGHLIGHTS,
  SAFEZONE,
  formatAlive,
  formatBRL,
  makeKillEvent,
  seedKillFeed,
  randInt,
  pick,
};
