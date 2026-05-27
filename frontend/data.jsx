// ===================================================================
// data.jsx — fetches live data from the BrasilZ Leaderboard API
//
// Kill feed: polls /api/killfeed every 10s with cache: 'no-store'
//   → fires 'killfeed-updated' event
//
// Leaderboard: polls every 30s
//   → fires 'gamedata-updated' event
// ===================================================================

const PERIODS = ["daily", "weekly", "monthly"];
const MODES = ["pvp", "pve"];
const TOP_LIMIT = 20;
const REFRESH_MS = 30_000;
const KILL_FEED_REFRESH_MS = 10_000;

// -------------------------------------------------------------------
// Formatting helpers
// -------------------------------------------------------------------
function formatAlive(min) {
  if (!Number.isFinite(min) || min <= 0) return "—";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = Math.floor(min % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBRL(value) {
  const n = Number(value) || 0;
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// -------------------------------------------------------------------
// Empty placeholders
// -------------------------------------------------------------------
function emptyLongestShot() {
  return { nick: "—", region: "—", dist: 0, weapon: "—", location: "—" };
}
function emptyLongestAlive() {
  return { nick: "—", region: "—", aliveMin: 0, location: "—" };
}
function emptySafezoneSide() {
  return { nick: "—", total: 0, transactions: 0, topItems: [] };
}

const RANKINGS = {};
const HIGHLIGHTS = {};
const SAFEZONE = {};
for (const p of PERIODS) {
  RANKINGS[p] = { pvp: [], pve: [] };
  HIGHLIGHTS[p] = {
    pvp: { longestShot: emptyLongestShot(), longestAlive: emptyLongestAlive() },
    pve: { longestShot: emptyLongestShot(), longestAlive: emptyLongestAlive() },
  };
  SAFEZONE[p] = { seller: emptySafezoneSide(), buyer: emptySafezoneSide() };
}

// -------------------------------------------------------------------
// Backend mappers
// -------------------------------------------------------------------
function mapRankingRows(rows, deathsByUid, lifeByUid) {
  return rows.map((r, i) => {
    const kills = Number(r.value) || 0;
    const deaths = deathsByUid?.get(r.uid) ?? 0;
    const kd = deaths > 0 ? +(kills / deaths).toFixed(2) : kills;
    const aliveSec = lifeByUid?.get(r.uid) ?? 0;
    return {
      rank: i + 1,
      uid: r.uid || null,
      nick: r.name || "—",
      kills,
      deaths,
      kd,
      aliveMin: Math.round(aliveSec / 60),
      headshotPct: 0,
      favWeapon: "—",
      region: "—",
      longestShot: { dist: 0, weapon: "—" },
    };
  });
}

function mapLongestShot(row) {
  if (!row) return emptyLongestShot();
  return {
    nick: row.name || "—",
    region: "—",
    dist: Math.round(Number(row.value) || 0),
    weapon: row.weapon_name || "—",
    location: "—",
  };
}

function mapLongestAlive(row) {
  if (!row) return emptyLongestAlive();
  return {
    nick: row.name || "—",
    region: "—",
    aliveMin: Math.round((Number(row.value) || 0) / 60),
    location: "—",
  };
}

function mapSafezoneSide(row) {
  if (!row) return emptySafezoneSide();
  return {
    nick: row.name || "—",
    total: Number(row.total) || 0,
    transactions: Number(row.transactions) || 0,
    topItems: (row.topItems || []).map((it) => ({
      name: it.name || "—",
      qty: Number(it.qty) || 0,
    })),
  };
}

// -------------------------------------------------------------------
// Kill feed state
// -------------------------------------------------------------------
const KILL_FEED = [];

function mapKillFeedRow(row) {
  const ts = new Date(row.occurred_at).getTime();
  const minutesAgo = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return {
    id: String(row.id),
    type: row.is_pvp ? "pvp" : "pve",
    killer: row.killer_name || "—",
    victim: row.victim_name || "—",
    weapon: row.weapon_name || "—",
    dist: Math.round(Number(row.distance_m) || 0),
    location: "—",
    minutesAgo,
    headshot: false,
  };
}

function seedKillFeed() {
  return KILL_FEED.slice();
}

function makeKillEvent() { return null; }
function pick(arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined; }
function randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

// -------------------------------------------------------------------
// Expose synchronously
// -------------------------------------------------------------------
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

// -------------------------------------------------------------------
// API fetch helpers
// -------------------------------------------------------------------
async function getJson(url, opts) {
  const res = await fetch(url, { credentials: "same-origin", ...opts });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// -------------------------------------------------------------------
// Kill feed — dedicated 10s refresh, no cache
// -------------------------------------------------------------------
async function fetchKillFeedLive() {
  try {
    const data = await getJson("/api/killfeed?limit=50", { cache: "no-store" });
    KILL_FEED.length = 0;
    for (const row of data.rows || []) KILL_FEED.push(mapKillFeedRow(row));
    window.dispatchEvent(new CustomEvent("killfeed-updated"));
  } catch (err) {
    console.warn("[data.jsx] killfeed refresh failed:", err.message);
  }
}

// -------------------------------------------------------------------
// Leaderboard + safezone — 30s refresh
// -------------------------------------------------------------------
async function fetchPeriodMode(period, mode) {
  const type = mode === "pvp" ? "pvp_kills" : "pve_kills";
  const [kills, deathsAgg, lifeAgg, longestShot, longestAlive] = await Promise.all([
    getJson(`/api/leaderboard?type=${type}&period=${period}&limit=${TOP_LIMIT}`),
    getJson(`/api/leaderboard?type=most_deaths&period=${period}&limit=200`),
    getJson(`/api/leaderboard?type=longest_life&period=${period}&limit=200`),
    getJson(`/api/leaderboard?type=longest_shot&period=${period}&limit=1`),
    getJson(`/api/leaderboard?type=longest_life&period=${period}&limit=1`),
  ]);

  const deathsByUid = new Map();
  for (const r of deathsAgg.rows || []) deathsByUid.set(r.uid, Number(r.value) || 0);
  const lifeByUid = new Map();
  for (const r of lifeAgg.rows || []) lifeByUid.set(r.uid, Number(r.value) || 0);

  RANKINGS[period][mode] = mapRankingRows(kills.rows || [], deathsByUid, lifeByUid);
  HIGHLIGHTS[period][mode] = {
    longestShot: mapLongestShot((longestShot.rows || [])[0]),
    longestAlive: mapLongestAlive((longestAlive.rows || [])[0]),
  };
}

async function fetchSafezone(period) {
  const data = await getJson(`/api/safezone?period=${period}`);
  SAFEZONE[period] = {
    seller: mapSafezoneSide(data.seller),
    buyer: mapSafezoneSide(data.buyer),
  };
}

async function refreshAll() {
  try {
    await Promise.all([
      ...PERIODS.flatMap((p) => MODES.map((m) => fetchPeriodMode(p, m))),
      ...PERIODS.map((p) => fetchSafezone(p)),
    ]);
    window.dispatchEvent(new CustomEvent("gamedata-updated"));
  } catch (err) {
    console.warn("[data.jsx] leaderboard refresh failed:", err.message);
  }
}

// Boot
fetchKillFeedLive();
setInterval(fetchKillFeedLive, KILL_FEED_REFRESH_MS);

refreshAll();
setInterval(refreshAll, REFRESH_MS);
