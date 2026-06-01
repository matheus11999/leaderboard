// ===================================================================
// data.jsx — fetches live data from the BrasilZ Leaderboard API
// (POST /v1/arma/events ingests events; GET /api/* serves aggregated data).
//
// window.GAME_DATA exposes the same shape the app expects:
//   - RANKINGS[period][mode]    → array of player rows
//   - RANKINGS[period].hunters  → top bounty hunters
//   - HIGHLIGHTS[period][mode]  → { longestShot, longestAlive }
//   - SAFEZONE[period]          → { seller, buyer }
//   - BOUNTIES                  → { active: [], completed: [] }
//   - helpers: formatAlive, formatBRL, seedKillFeed (initial empty), makeKillEvent (legacy noop)
//
// Kill feed: polls /api/killfeed every 10s with cache: 'no-store'
//   → fires 'killfeed-updated' event
//
// Leaderboard: polls every 30s
//   → fires 'gamedata-updated' event
// ===================================================================

const DATA_PERIOD_IDS = ["daily", "weekly", "monthly"];
const MODES = ["pvp", "pve"];
const TOP_LIMIT = 20;
const REFRESH_MS = 30_000;
const KILL_FEED_REFRESH_MS = 10_000;
const DEFAULT_SERVER_ID = "brasilz-main";

// -------------------------------------------------------------------
// Formatting helpers (kept identical to the original mock data.jsx so
// the app components don't need to change).
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
// Empty placeholders so app components don't crash before the first fetch.
// -------------------------------------------------------------------
function emptyLongestShot() {
  return { nick: "—", region: "—", dist: 0, weapon: "—", location: "—" };
}
function emptyLongestAlive() {
  return { nick: "—", region: "—", aliveMin: 0, location: "—" };
}
function emptySafezoneSide() {
  return { uid: null, nick: "—", total: 0, transactions: 0, topItems: [] };
}

const RANKINGS = {};
const HIGHLIGHTS = {};
const SAFEZONE = {};
const BOUNTIES = {
  active: [],
  completed: [],
};
const SERVERS = [];
let SELECTED_SERVER = detectSelectedServer();
const SERVER_STATS = {
  onlineNow: 0,
  maxPlayers: 80,
  totalPlayersRegistered: 0,
  totalKills: 0,
  totalPvpKills: 0,
  activeMissions: 0,
  killsLast24h: 0,
  activeBounties: 0,
};
for (const p of DATA_PERIOD_IDS) {
  RANKINGS[p] = { pvp: [], pve: [], hunters: [] };
  HIGHLIGHTS[p] = {
    pvp: { longestShot: emptyLongestShot(), longestAlive: emptyLongestAlive() },
    pve: { longestShot: emptyLongestShot(), longestAlive: emptyLongestAlive() },
  };
  SAFEZONE[p] = { seller: emptySafezoneSide(), buyer: emptySafezoneSide(), sellers: [], buyers: [] };
}

function resetLiveData() {
  KILL_FEED.length = 0;
  BOUNTIES.active = [];
  BOUNTIES.completed = [];
  SERVER_STATS.onlineNow = 0;
  SERVER_STATS.maxPlayers = 80;
  SERVER_STATS.totalPlayersRegistered = 0;
  SERVER_STATS.totalKills = 0;
  SERVER_STATS.totalPvpKills = 0;
  SERVER_STATS.activeMissions = 0;
  SERVER_STATS.killsLast24h = 0;
  SERVER_STATS.activeBounties = 0;

  for (const p of DATA_PERIOD_IDS) {
    RANKINGS[p] = { pvp: [], pve: [], hunters: [] };
    HIGHLIGHTS[p] = {
      pvp: { longestShot: emptyLongestShot(), longestAlive: emptyLongestAlive() },
      pve: { longestShot: emptyLongestShot(), longestAlive: emptyLongestAlive() },
    };
    SAFEZONE[p] = { seller: emptySafezoneSide(), buyer: emptySafezoneSide(), sellers: [], buyers: [] };
  }
}

// -------------------------------------------------------------------
// Backend mappers — translate API rows into the shape the app expects.
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
    weapon: cleanWeaponName(row.weapon_name),
    location: "—",
  };
}

function cleanWeaponName(value) {
  const name = String(value || "").trim();
  if (!name) return "—";

  if (
    name.startsWith("Character_") ||
    name.includes("Prefabs/Characters/") ||
    name.includes("Assets/Characters/")
  ) {
    return "—";
  }

  return name;
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
    uid: row.uid || null,
    nick: row.name || "—",
    total: Number(row.total) || 0,
    transactions: Number(row.transactions) || 0,
    topItems: (row.topItems || []).map((it) => ({
      name: it.name || "—",
      qty: Number(it.qty) || 0,
    })),
  };
}

function mapSafezoneRows(rows) {
  return (rows || []).map((row, i) => ({
    rank: i + 1,
    uid: row.uid || null,
    nick: row.name || "—",
    value: Number(row.total) || 0,
    transactions: Number(row.transactions) || 0,
  }));
}

function mapHunterRows(rows) {
  return (rows || []).map((row, i) => ({
    rank: i + 1,
    uid: row.uid || null,
    nick: row.name || "—",
    hunts: Number(row.value) || 0,
    earned: Number(row.total_value) || 0,
  }));
}

// -------------------------------------------------------------------
// Kill feed cache
// -------------------------------------------------------------------
const KILL_FEED = [];

function mapKillFeedRow(row) {
  const ts = new Date(row.occurred_at).getTime();
  const minutesAgo = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return {
    id: String(row.id),
    type: row.is_suicide ? "suicide" : (row.is_pvp ? "pvp" : "pve"),
    isSuicide: !!row.is_suicide,
    isBountyKill: !!row.is_bounty_kill,
    killer: row.killer_name || "—",
    victim: row.victim_name || "—",
    weapon: cleanWeaponName(row.weapon_name),
    dist: Math.round(Number(row.distance_m) || 0),
    location: "—",
    minutesAgo,
    headshot: false,
  };
}

function seedKillFeed() {
  return KILL_FEED.slice();
}

// Legacy mock no-op kept for back-compat with any widget that still calls it.
function makeKillEvent() {
  return null;
}
function pick(arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined; }
function randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

// -------------------------------------------------------------------
// Expose synchronously so the React tree can mount immediately.
// -------------------------------------------------------------------
window.GAME_DATA = {
  RANKINGS,
  HIGHLIGHTS,
  SAFEZONE,
  BOUNTIES,
  SERVERS,
  SELECTED_SERVER,
  SERVER_STATS,
  formatAlive,
  formatBRL,
  makeKillEvent,
  seedKillFeed,
  selectServer,
  randInt,
  pick,
};

// -------------------------------------------------------------------
// API fetchers
// -------------------------------------------------------------------
async function getJson(url, opts) {
  const res = await fetch(url, { credentials: "same-origin", ...opts });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function detectSelectedServer() {
  const params = new URLSearchParams(window.location.search || "");
  const fromQuery = params.get("server_id") || params.get("server");
  if (fromQuery) return fromQuery.trim();

  const match = window.location.pathname.match(/^\/server\/([^/]+)/);
  if (match) return decodeURIComponent(match[1]);
  return DEFAULT_SERVER_ID;
}

function withServer(url, serverId = SELECTED_SERVER) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}server=${encodeURIComponent(serverId)}`;
}

function serverUrl(serverId) {
  return `/server/${encodeURIComponent(serverId || DEFAULT_SERVER_ID)}`;
}

function selectServer(serverId, opts = {}) {
  const next = String(serverId || DEFAULT_SERVER_ID).trim() || DEFAULT_SERVER_ID;
  if (next === SELECTED_SERVER) return false;

  SELECTED_SERVER = next;
  window.GAME_DATA.SELECTED_SERVER = next;
  resetLiveData();

  if (opts.updateUrl !== false && window.history?.pushState) {
    window.history.pushState({ server: next }, "", serverUrl(next));
  }

  window.dispatchEvent(new CustomEvent("server-changing", { detail: { server: next } }));
  window.dispatchEvent(new CustomEvent("killfeed-updated"));
  window.dispatchEvent(new CustomEvent("gamedata-updated"));
  fetchKillFeedLive(next);
  refreshAll(next);
  return true;
}

async function fetchServers() {
  try {
    const data = await getJson("/api/servers", { cache: "no-store" });
    SERVERS.length = 0;
    for (const row of data.rows || []) SERVERS.push(row);
    window.dispatchEvent(new CustomEvent("gamedata-updated"));
  } catch (err) {
    console.warn("[data.jsx] servers refresh failed:", err.message);
  }
}

// -------------------------------------------------------------------
// Kill feed — dedicated 10s refresh, no cache, fires killfeed-updated
// -------------------------------------------------------------------
async function fetchKillFeedLive(serverId = SELECTED_SERVER) {
  try {
    const data = await getJson(withServer("/api/killfeed?limit=200", serverId), { cache: "no-store" });
    if (serverId !== SELECTED_SERVER) return;
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
async function fetchPeriodMode(period, mode, serverId = SELECTED_SERVER) {
  const type = mode === "pvp" ? "pvp_kills" : "pve_kills";
  const [kills, deathsAgg, lifeAgg, longestShot, longestAlive] = await Promise.all([
    getJson(withServer(`/api/leaderboard?type=${type}&period=${period}&limit=${TOP_LIMIT}`, serverId)),
    getJson(withServer(`/api/leaderboard?type=most_deaths&period=${period}&limit=200`, serverId)),
    getJson(withServer(`/api/leaderboard?type=longest_life&period=${period}&limit=200`, serverId)),
    getJson(withServer(`/api/leaderboard?type=longest_shot&period=${period}&limit=1`, serverId)),
    getJson(withServer(`/api/leaderboard?type=longest_life&period=${period}&limit=1`, serverId)),
  ]);
  if (serverId !== SELECTED_SERVER) return;

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

async function fetchSafezone(period, serverId = SELECTED_SERVER) {
  const data = await getJson(withServer(`/api/safezone?period=${period}`, serverId));
  if (serverId !== SELECTED_SERVER) return;
  SAFEZONE[period] = {
    seller: mapSafezoneSide(data.seller),
    buyer: mapSafezoneSide(data.buyer),
    sellers: mapSafezoneRows(data.sellers),
    buyers: mapSafezoneRows(data.buyers),
  };
}

async function fetchTopHunters(period, serverId = SELECTED_SERVER) {
  const data = await getJson(withServer(`/api/leaderboard?type=bounty_hunters&period=${period}&limit=3`, serverId));
  if (serverId !== SELECTED_SERVER) return;
  RANKINGS[period].hunters = mapHunterRows(data.rows || []);
}

async function fetchBounties(serverId = SELECTED_SERVER) {
  const [active, completed] = await Promise.all([
    getJson(withServer(`/api/bounties/active?limit=20`, serverId)),
    getJson(withServer(`/api/bounties/completed?limit=20`, serverId)),
  ]);
  if (serverId !== SELECTED_SERVER) return;

  BOUNTIES.active = (active.rows || []).map((r) => ({
    uid: r.uid || null,
    nick: r.name || "—",
    streak: Number(r.current_kill_streak) || 0,
    bestStreak: Number(r.best_kill_streak) || 0,
    value: Number(r.bounty_value) || 0,
    since: r.bounty_started_at || null,
    lastSeen: r.last_seen || null,
  }));

  BOUNTIES.completed = (completed.rows || []).map((r) => ({
    id: String(r.id),
    target: r.target_name || "—",
    hunter: r.hunter_name || "—",
    streak: Number(r.target_streak) || 0,
    value: Number(r.bounty_value) || 0,
    weapon: cleanWeaponName(r.weapon_name),
    dist: Math.round(Number(r.distance_m) || 0),
    occurredAt: r.occurred_at || null,
    startedAt: r.bounty_started_at || null,
    durationS: Number.isFinite(Number(r.duration_s)) ? Number(r.duration_s) : null,
    claimed: !!r.claimed,
    claimedAt: r.claimed_at || null,
  }));
}

async function fetchServerStats(serverId = SELECTED_SERVER) {
  const data = await getJson(withServer(`/api/stats/server`, serverId));
  if (serverId !== SELECTED_SERVER) return;
  SERVER_STATS.onlineNow = Number(data.online_now) || 0;
  SERVER_STATS.totalPlayersRegistered = Number(data.total_players_registered) || 0;
  SERVER_STATS.totalKills = Number(data.total_kills) || 0;
  SERVER_STATS.totalPvpKills = Number(data.total_pvp_kills) || 0;
  SERVER_STATS.activeMissions = Number(data.active_missions) || 0;
  SERVER_STATS.killsLast24h = Number(data.kills_last_24h) || 0;
  SERVER_STATS.activeBounties = Number(data.active_bounties) || 0;
}

async function refreshAll(serverId = SELECTED_SERVER) {
  const tasks = [
    ...DATA_PERIOD_IDS.flatMap((p) => MODES.map((m) => fetchPeriodMode(p, m, serverId))),
    ...DATA_PERIOD_IDS.map((p) => fetchSafezone(p, serverId)),
    ...DATA_PERIOD_IDS.map((p) => fetchTopHunters(p, serverId)),
    fetchBounties(serverId),
    fetchServerStats(serverId),
  ];

  const results = await Promise.allSettled(tasks);
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) {
    console.warn("[data.jsx] partial refresh failed:", failed.map((r) => r.reason?.message || r.reason).join(" | "));
  }
  if (serverId === SELECTED_SERVER) {
    window.dispatchEvent(new CustomEvent("gamedata-updated"));
  }
}

window.addEventListener("popstate", () => {
  const next = detectSelectedServer();
  selectServer(next, { updateUrl: false });
});

// Boot
fetchKillFeedLive();
setInterval(fetchKillFeedLive, KILL_FEED_REFRESH_MS);

fetchServers();
refreshAll();
setInterval(refreshAll, REFRESH_MS);
