'use strict';

const express = require('express');
const db = require('../db');
const { requireAdmin, login } = require('../auth');

const router = express.Router();

// -------------------------------------------------------------------
// Public endpoints (no auth) — health check + login
// -------------------------------------------------------------------
router.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', uptime_s: Math.floor(process.uptime()) });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', error: err.message });
  }
});

router.post('/login', express.json(), login);

router.post('/logout', (_req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  res.json({ ok: true });
});

// -------------------------------------------------------------------
// Auth wall for everything below.
// -------------------------------------------------------------------
router.use(requireAdmin);

router.get('/me', (req, res) => {
  res.json({ admin: req.admin });
});

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
function clampLimit(raw, def = 50, max = 500) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}
function clampOffset(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}
function ilikePattern(s) {
  if (!s) return null;
  return '%' + String(s).replace(/[%_]/g, '\\$&') + '%';
}
function clampNumber(raw, def, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// -------------------------------------------------------------------
// Overview — private dashboard stats
// -------------------------------------------------------------------
router.get('/overview', async (_req, res) => {
  try {
    const [
      players, sessions, openSessions, kills, killsPvp, killsLast24,
      shopRows, shopVolume, missions, missionsActive,
      eventsRaw, eventsUnprocessed, eventsLast24, bountiesActive, bountiesPending,
    ] = await Promise.all([
      db.query(`SELECT COUNT(*)::INT AS n FROM players`),
      db.query(`SELECT COUNT(*)::INT AS n FROM sessions`),
      db.query(`SELECT COUNT(*)::INT AS n FROM sessions WHERE disconnected_at IS NULL`),
      db.query(`SELECT COUNT(*)::INT AS n FROM kills`),
      db.query(`SELECT COUNT(*)::INT AS n FROM kills WHERE is_pvp = true`),
      db.query(`SELECT COUNT(*)::INT AS n FROM kills WHERE occurred_at > NOW() - INTERVAL '24 hours'`),
      db.query(`SELECT COUNT(*)::INT AS n FROM shop_events`),
      db.query(`SELECT COALESCE(SUM(price), 0)::BIGINT AS total FROM shop_events WHERE success = true`),
      db.query(`SELECT COUNT(*)::INT AS n FROM missions`),
      db.query(`SELECT COUNT(*)::INT AS n FROM missions WHERE ended_at IS NULL`),
      db.query(`SELECT COUNT(*)::INT AS n FROM events_raw`),
      db.query(`SELECT COUNT(*)::INT AS n FROM events_raw WHERE processed = false`),
      db.query(`SELECT COUNT(*)::INT AS n FROM events_raw WHERE received_at > NOW() - INTERVAL '24 hours'`),
      db.query(`SELECT COUNT(*)::INT AS n FROM players WHERE bounty_active = true`),
      db.query(`SELECT COUNT(*)::INT AS n FROM bounty_events WHERE claimed = false`),
    ]);

    res.json({
      players: players.rows[0].n,
      sessions: sessions.rows[0].n,
      sessions_open: openSessions.rows[0].n,
      kills_total: kills.rows[0].n,
      kills_pvp: killsPvp.rows[0].n,
      kills_last_24h: killsLast24.rows[0].n,
      shop_events: shopRows.rows[0].n,
      shop_volume_total: Number(shopVolume.rows[0].total),
      missions_total: missions.rows[0].n,
      missions_active: missionsActive.rows[0].n,
      events_raw_total: eventsRaw.rows[0].n,
      events_raw_unprocessed: eventsUnprocessed.rows[0].n,
      events_raw_last_24h: eventsLast24.rows[0].n,
      bounties_active: bountiesActive.rows[0].n,
      bounties_pending: bountiesPending.rows[0].n,
      uptime_s: Math.floor(process.uptime()),
    });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// -------------------------------------------------------------------
// Bounty settings and reward queue
// -------------------------------------------------------------------
router.get('/bounty/settings', async (_req, res) => {
  try {
    const r = await db.query(
      `SELECT enabled, min_kills, base_value, increase_pct, updated_at
         FROM bounty_settings
        WHERE id = true`
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.patch('/bounty/settings', express.json(), async (req, res) => {
  const body = req.body || {};
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
  const minKills = Math.round(clampNumber(body.min_kills, 5, 1, 100));
  const baseValue = Math.round(clampNumber(body.base_value, 5000, 0, 10_000_000));
  const increasePct = clampNumber(body.increase_pct, 20, 0, 1000);

  try {
    const r = await db.query(
      `INSERT INTO bounty_settings (id, enabled, min_kills, base_value, increase_pct, updated_at)
       VALUES (true, $1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         min_kills = EXCLUDED.min_kills,
         base_value = EXCLUDED.base_value,
         increase_pct = EXCLUDED.increase_pct,
         updated_at = NOW()
       RETURNING enabled, min_kills, base_value, increase_pct, updated_at`,
      [enabled, minKills, baseValue, increasePct]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'update failed', message: err.message });
  }
});

router.get('/bounty/rewards', async (req, res) => {
  const limit = clampLimit(req.query.limit);
  const offset = clampOffset(req.query.offset);
  const claimed = req.query.claimed;
  const conds = [];
  const params = [limit, offset];
  if (claimed === 'true') conds.push('claimed = true');
  else if (claimed === 'false') conds.push('claimed = false');
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const rowsR = await db.query(
      `SELECT id, occurred_at, server_id, target_name, hunter_name,
              target_streak, bounty_value, bounty_started_at,
              CASE
                WHEN bounty_started_at IS NULL THEN NULL
                ELSE GREATEST(0, EXTRACT(EPOCH FROM (occurred_at - bounty_started_at))::INT)
              END AS duration_s,
              claimed, claimed_at
         FROM bounty_events
         ${where}
        ORDER BY occurred_at DESC
        LIMIT $1 OFFSET $2`,
      params
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM bounty_events ${where}`);
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// -------------------------------------------------------------------
// Players
// -------------------------------------------------------------------
router.get('/players', async (req, res) => {
  const limit = clampLimit(req.query.limit, 50, 500);
  const offset = clampOffset(req.query.offset);
  const search = ilikePattern(req.query.search);
  const banned = req.query.banned;

  const conds = [];
  const params = [limit, offset];
  if (search) {
    params.push(search);
    conds.push(`(name ILIKE $${params.length} OR uid ILIKE $${params.length})`);
  }
  if (banned === 'true') conds.push('is_banned = true');
  else if (banned === 'false') conds.push('is_banned = false');
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const rowsR = await db.query(
      `SELECT uid, name, first_seen, last_seen, total_kills, total_deaths,
              deaths_pvp, deaths_zombie, deaths_bandit, deaths_env, deaths_suicide,
              longest_shot_m, longest_life_s, current_kill_streak, best_kill_streak,
              bounty_active, bounty_value, total_playtime_s, current_balance, is_banned
         FROM players
         ${where}
        ORDER BY last_seen DESC
        LIMIT $1 OFFSET $2`,
      params
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM players ${where}`, params.slice(2));
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.get('/players/:uid', async (req, res) => {
  try {
    const r = await db.query(`SELECT * FROM players WHERE uid = $1`, [req.params.uid]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.patch('/players/:uid', express.json(), async (req, res) => {
  const { name, is_banned, reset_stats } = req.body || {};
  const sets = [];
  const params = [req.params.uid];
  if (typeof name === 'string' && name.trim()) {
    params.push(name.trim());
    sets.push(`name = $${params.length}`);
  }
  if (typeof is_banned === 'boolean') {
    params.push(is_banned);
    sets.push(`is_banned = $${params.length}`);
  }
  if (reset_stats === true) {
    sets.push(`total_kills = 0, total_deaths = 0, deaths_pvp = 0, deaths_zombie = 0,
               deaths_bandit = 0, deaths_env = 0, deaths_suicide = 0,
               longest_shot_m = 0, longest_life_s = 0,
               current_kill_streak = 0, best_kill_streak = 0,
               bounty_active = false, bounty_value = 0, bounty_started_at = NULL`);
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields to update' });

  try {
    const r = await db.query(
      `UPDATE players SET ${sets.join(', ')} WHERE uid = $1 RETURNING *`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'update failed', message: err.message });
  }
});

router.delete('/players/:uid', async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM players WHERE uid = $1 RETURNING uid, name`, [req.params.uid]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'delete failed', message: err.message });
  }
});

router.post('/players/:uid/ban', express.json(), async (req, res) => {
  const ban = req.body?.ban !== false;
  try {
    const r = await db.query(
      `UPDATE players SET is_banned = $2 WHERE uid = $1 RETURNING uid, name, is_banned`,
      [req.params.uid, ban]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'update failed', message: err.message });
  }
});

router.get('/players/:uid/sessions', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, connected_at, disconnected_at, duration_s, spawn_point, spawn_prefab,
              balance_in, balance_out
         FROM sessions
        WHERE player_uid = $1
        ORDER BY connected_at DESC
        LIMIT 200`,
      [req.params.uid]
    );
    res.json({ rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// -------------------------------------------------------------------
// Kills
// -------------------------------------------------------------------
router.get('/kills', async (req, res) => {
  const limit = clampLimit(req.query.limit);
  const offset = clampOffset(req.query.offset);
  const search = ilikePattern(req.query.search);
  const killerType = req.query.killer_type;

  const conds = [];
  const params = [limit, offset];
  if (search) {
    params.push(search);
    conds.push(`(victim_name ILIKE $${params.length} OR killer_name ILIKE $${params.length} OR weapon_name ILIKE $${params.length})`);
  }
  if (killerType) {
    params.push(String(killerType));
    conds.push(`killer_type = $${params.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const rowsR = await db.query(
      `SELECT id, occurred_at, victim_uid, victim_name, killer_type, killer_uid, killer_name,
              weapon_name, distance_m, is_pvp, is_suicide, victim_alive_s
         FROM kills
         ${where}
        ORDER BY occurred_at DESC
        LIMIT $1 OFFSET $2`,
      params
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM kills ${where}`, params.slice(2));
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.delete('/kills/:id', async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM kills WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'delete failed', message: err.message });
  }
});

// -------------------------------------------------------------------
// Shop events
// -------------------------------------------------------------------
router.get('/shop_events', async (req, res) => {
  const limit = clampLimit(req.query.limit);
  const offset = clampOffset(req.query.offset);
  const search = ilikePattern(req.query.search);
  const isPurchase = req.query.is_purchase;

  const conds = [];
  const params = [limit, offset];
  if (search) {
    params.push(search);
    conds.push(`(player_name ILIKE $${params.length} OR item_name ILIKE $${params.length})`);
  }
  if (isPurchase === 'true') conds.push('is_purchase = true');
  else if (isPurchase === 'false') conds.push('is_purchase = false');
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const rowsR = await db.query(
      `SELECT id, occurred_at, player_uid, player_name, item_name, item_prefab,
              quantity, is_purchase, success, price, balance_after
         FROM shop_events
         ${where}
        ORDER BY occurred_at DESC
        LIMIT $1 OFFSET $2`,
      params
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM shop_events ${where}`, params.slice(2));
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.delete('/shop_events/:id', async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM shop_events WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'delete failed', message: err.message });
  }
});

// -------------------------------------------------------------------
// Missions
// -------------------------------------------------------------------
router.get('/missions', async (req, res) => {
  const limit = clampLimit(req.query.limit);
  const offset = clampOffset(req.query.offset);
  const search = ilikePattern(req.query.search);
  const active = req.query.active;

  const conds = [];
  const params = [limit, offset];
  if (search) {
    params.push(search);
    conds.push(`mission_name ILIKE $${params.length}`);
  }
  if (active === 'true') conds.push('ended_at IS NULL');
  else if (active === 'false') conds.push('ended_at IS NOT NULL');
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const rowsR = await db.query(
      `SELECT id, started_at, ended_at, sub_idx, mission_name, won, cooldown_s
         FROM missions
         ${where}
        ORDER BY started_at DESC
        LIMIT $1 OFFSET $2`,
      params
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM missions ${where}`, params.slice(2));
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.delete('/missions/:id', async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM missions WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'delete failed', message: err.message });
  }
});

// -------------------------------------------------------------------
// Raw events (audit log)
// -------------------------------------------------------------------
router.get('/events', async (req, res) => {
  const limit = clampLimit(req.query.limit, 100, 500);
  const offset = clampOffset(req.query.offset);
  const type = req.query.type;
  const processed = req.query.processed;
  const hasError = req.query.has_error;

  const conds = [];
  const params = [limit, offset];
  if (type) {
    params.push(String(type));
    conds.push(`event_type = $${params.length}`);
  }
  if (processed === 'true') conds.push('processed = true');
  else if (processed === 'false') conds.push('processed = false');
  if (hasError === 'true') conds.push('error IS NOT NULL');
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const rowsR = await db.query(
      `SELECT id, received_at, server_id, event_type, timestamp_unix, processed, error, payload
         FROM events_raw
         ${where}
        ORDER BY received_at DESC
        LIMIT $1 OFFSET $2`,
      params
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM events_raw ${where}`, params.slice(2));
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM events_raw WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'delete failed', message: err.message });
  }
});

// Bulk delete events_raw older than N days (cleanup helper).
router.post('/events/purge', express.json(), async (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isFinite(days) || days < 1) {
    return res.status(400).json({ error: 'days must be >= 1' });
  }
  try {
    const r = await db.query(
      `DELETE FROM events_raw WHERE received_at < NOW() - ($1 || ' days')::INTERVAL RETURNING id`,
      [String(days)]
    );
    res.json({ deleted_count: r.rows.length });
  } catch (err) {
    res.status(500).json({ error: 'purge failed', message: err.message });
  }
});

// -------------------------------------------------------------------
// Sessions
// -------------------------------------------------------------------
router.get('/sessions', async (req, res) => {
  const limit = clampLimit(req.query.limit);
  const offset = clampOffset(req.query.offset);
  const open = req.query.open;

  const conds = [];
  const params = [limit, offset];
  if (open === 'true') conds.push('disconnected_at IS NULL');
  else if (open === 'false') conds.push('disconnected_at IS NOT NULL');
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const rowsR = await db.query(
      `SELECT s.id, s.player_uid, p.name AS player_name, s.connected_at, s.disconnected_at,
              s.duration_s, s.spawn_point, s.balance_in, s.balance_out
         FROM sessions s
         LEFT JOIN players p ON p.uid = s.player_uid
         ${where}
        ORDER BY s.connected_at DESC
        LIMIT $1 OFFSET $2`,
      params
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM sessions s ${where}`, params.slice(2));
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
