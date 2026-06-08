'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAdmin, login } = require('../auth');
const { normalizeServerId, slugifyServerId, serverFilter, ensureServer } = require('../lib/servers');
const { onlineGraceSeconds, onlineSql } = require('../lib/online');

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
// Admin users
// -------------------------------------------------------------------
function normalizeAdminUsername(raw) {
  const username = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return null;
  return username;
}

router.get('/admins', async (_req, res) => {
  try {
    const r = await db.query(
      `SELECT username, created_at
         FROM admin_users
        ORDER BY username ASC`
    );
    res.json({ rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.post('/admins', express.json(), async (req, res) => {
  const username = normalizeAdminUsername(req.body?.username);
  const password = String(req.body?.password || '');
  if (!username) {
    return res.status(400).json({ error: 'username must be 3-32 chars: a-z, 0-9, dot, dash or underscore' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const r = await db.query(
      `INSERT INTO admin_users (username, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING username, created_at`,
      [username, hash]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'save failed', message: err.message });
  }
});

router.patch('/admins/:username', express.json(), async (req, res) => {
  const oldUsername = normalizeAdminUsername(req.params.username);
  const newUsername = req.body?.username ? normalizeAdminUsername(req.body.username) : oldUsername;
  const password = req.body?.password != null ? String(req.body.password) : '';
  if (!oldUsername || !newUsername) {
    return res.status(400).json({ error: 'invalid username' });
  }
  if (oldUsername === req.admin?.username && newUsername !== oldUsername) {
    return res.status(400).json({ error: 'cannot rename the admin currently logged in' });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  try {
    const r = await db.tx(async (c) => {
      const exists = await c.query(`SELECT username FROM admin_users WHERE username = $1`, [oldUsername]);
      if (!exists.rows[0]) return { rows: [] };

      if (newUsername !== oldUsername) {
        const taken = await c.query(`SELECT username FROM admin_users WHERE username = $1`, [newUsername]);
        if (taken.rows[0]) {
          const err = new Error('username already exists');
          err.statusCode = 409;
          throw err;
        }
      }

      if (password) {
        const hash = await bcrypt.hash(password, 12);
        return c.query(
          `UPDATE admin_users
              SET username = $2, password_hash = $3
            WHERE username = $1
            RETURNING username, created_at`,
          [oldUsername, newUsername, hash]
        );
      }

      return c.query(
        `UPDATE admin_users
            SET username = $2
          WHERE username = $1
          RETURNING username, created_at`,
        [oldUsername, newUsername]
      );
    });

    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode === 409 ? 'conflict' : 'save failed', message: err.message });
  }
});

router.delete('/admins/:username', async (req, res) => {
  const username = normalizeAdminUsername(req.params.username);
  if (!username) return res.status(400).json({ error: 'invalid username' });
  if (username === req.admin?.username) {
    return res.status(400).json({ error: 'cannot delete the admin currently logged in' });
  }

  try {
    const r = await db.tx(async (c) => {
      const countR = await c.query(`SELECT COUNT(*)::INT AS n FROM admin_users`);
      if (countR.rows[0].n <= 1) {
        const err = new Error('cannot delete the last admin');
        err.statusCode = 400;
        throw err;
      }
      return c.query(`DELETE FROM admin_users WHERE username = $1 RETURNING username`, [username]);
    });
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: 'delete failed', message: err.message });
  }
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
function addServerCondition(req, conds, params, column = 'server_id') {
  const selectedServer = serverFilter(req);
  if (!selectedServer) return null;
  params.push(selectedServer);
  conds.push(`${column} = $${params.length}`);
  return selectedServer;
}

// -------------------------------------------------------------------
// Servers
// -------------------------------------------------------------------
router.get('/servers', async (_req, res) => {
  try {
    const r = await db.query(
      `SELECT id, name, slug, public_enabled, is_default, created_at, updated_at
         FROM servers
        ORDER BY is_default DESC, name ASC`
    );
    res.json({ rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.post('/servers', express.json(), async (req, res) => {
  const id = normalizeServerId(req.body?.id || req.body?.server_id);
  const name = String(req.body?.name || id).trim() || id;
  const slug = String(req.body?.slug || slugifyServerId(id)).trim() || slugifyServerId(id);
  const publicEnabled = req.body?.public_enabled !== false;
  const isDefault = req.body?.is_default === true;

  try {
    const r = await db.tx(async (c) => {
      if (isDefault) await c.query(`UPDATE servers SET is_default = false`);
      return c.query(
        `INSERT INTO servers (id, name, slug, public_enabled, is_default, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           public_enabled = EXCLUDED.public_enabled,
           is_default = EXCLUDED.is_default,
           updated_at = NOW()
         RETURNING id, name, slug, public_enabled, is_default, created_at, updated_at`,
        [id, name, slug, publicEnabled, isDefault]
      );
    });
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'create failed', message: err.message });
  }
});

router.patch('/servers/:id', express.json(), async (req, res) => {
  const id = normalizeServerId(req.params.id);
  const fields = [];
  const params = [id];
  if (typeof req.body?.name === 'string' && req.body.name.trim()) {
    params.push(req.body.name.trim());
    fields.push(`name = $${params.length}`);
  }
  if (typeof req.body?.slug === 'string' && req.body.slug.trim()) {
    params.push(req.body.slug.trim());
    fields.push(`slug = $${params.length}`);
  }
  if (typeof req.body?.public_enabled === 'boolean') {
    params.push(req.body.public_enabled);
    fields.push(`public_enabled = $${params.length}`);
  }
  if (typeof req.body?.is_default === 'boolean') {
    params.push(req.body.is_default);
    fields.push(`is_default = $${params.length}`);
  }
  if (!fields.length) return res.status(400).json({ error: 'no fields to update' });

  try {
    const r = await db.tx(async (c) => {
      if (req.body?.is_default === true) await c.query(`UPDATE servers SET is_default = false`);
      return c.query(
        `UPDATE servers
            SET ${fields.join(', ')}, updated_at = NOW()
          WHERE id = $1
          RETURNING id, name, slug, public_enabled, is_default, created_at, updated_at`,
        params
      );
    });
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'update failed', message: err.message });
  }
});

router.delete('/servers/:id', async (req, res) => {
  const id = normalizeServerId(req.params.id);
  try {
    const r = await db.query(
      `DELETE FROM servers WHERE id = $1 AND is_default = false
       RETURNING id, name, slug`,
      [id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'server not found or default server cannot be removed' });
    res.json({ deleted: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'delete failed', message: err.message });
  }
});

// -------------------------------------------------------------------
// Overview — private dashboard stats
// -------------------------------------------------------------------
// -------------------------------------------------------------------
// Restart audit
// -------------------------------------------------------------------
router.get('/restarts', async (req, res) => {
  const limit = clampLimit(req.query.limit, 50, 200);
  const offset = clampOffset(req.query.offset);
  const selectedServer = serverFilter(req);
  const params = [limit, offset];
  const conds = [];
  if (selectedServer) {
    params.push(selectedServer);
    conds.push(`r.server_id = $${params.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const countParams = selectedServer ? [selectedServer] : [];
  const countWhere = selectedServer ? 'WHERE server_id = $1' : '';

  try {
    const rowsR = await db.query(
      `SELECT r.id, r.server_id, s.name AS server_name, r.restart_key,
              r.started_at, r.ended_at, r.status, r.reason, r.manual_restart,
              r.restart_at_unix, r.startup_unix, r.player_count,
              r.saved_count, r.snapshot_count, r.snapshot_restore_count,
              r.queue_reject_count, r.error_count, r.updated_at
         FROM server_restarts r
         LEFT JOIN servers s ON s.id = r.server_id
         ${where}
        ORDER BY r.started_at DESC
        LIMIT $1 OFFSET $2`,
      params
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM server_restarts ${countWhere}`, countParams);
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.get('/restarts/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid restart id' });

  try {
    const restartR = await db.query(
      `SELECT r.*, s.name AS server_name
         FROM server_restarts r
         LEFT JOIN servers s ON s.id = r.server_id
        WHERE r.id = $1`,
      [id]
    );
    const restart = restartR.rows[0];
    if (!restart) return res.status(404).json({ error: 'not found' });

    const eventsR = await db.query(
      `SELECT id, occurred_at, event_type, phase, severity, player_id,
              player_uid, player_name, reason, details
         FROM server_restart_events
        WHERE restart_id = $1
        ORDER BY occurred_at ASC, id ASC`,
      [id]
    );

    const playersR = await db.query(
      `SELECT
         COALESCE(player_uid, 'player_id:' || COALESCE(player_id::TEXT, 'unknown')) AS key,
         MAX(player_uid) AS player_uid,
         MAX(player_name) AS player_name,
         MAX(player_id) AS player_id,
         COUNT(*)::INT AS event_count,
         BOOL_OR(phase = 'snapshot_saved' OR (details->>'snapshot_saved')::BOOL IS TRUE) AS snapshot_saved,
         BOOL_OR(phase = 'snapshot_restored') AS snapshot_restored,
         BOOL_OR(phase IN ('queue_rejected', 'restore_kicked')) AS queue_issue,
         BOOL_OR(phase = 'vanilla_restored' OR phase = 'vanilla_character_loaded_ok') AS vanilla_restored,
         BOOL_OR(severity IN ('error', 'warning')) AS has_warning,
         MIN(occurred_at) AS first_event_at,
         MAX(occurred_at) AS last_event_at
       FROM server_restart_events
       WHERE restart_id = $1
         AND (player_uid IS NOT NULL OR player_id IS NOT NULL OR player_name IS NOT NULL)
       GROUP BY key
       ORDER BY has_warning DESC, snapshot_restored DESC, last_event_at DESC`,
      [id]
    );

    const rawR = await db.query(
      `SELECT id, received_at, event_type, processed, error, payload
         FROM events_raw
        WHERE server_id = $1
          AND received_at BETWEEN $2::timestamptz - INTERVAL '10 minutes'
                              AND COALESCE($3::timestamptz, $2::timestamptz + INTERVAL '25 minutes')
        ORDER BY received_at ASC
        LIMIT 300`,
      [restart.server_id, restart.started_at, restart.ended_at]
    );

    res.json({
      restart,
      players: playersR.rows,
      events: eventsR.rows,
      raw_events: rawR.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const selectedServer = serverFilter(req);
    const p = selectedServer ? [selectedServer] : [];
    const where = selectedServer ? 'WHERE server_id = $1' : '';
    const and = selectedServer ? 'AND server_id = $1' : '';
    const onlineSeconds = onlineGraceSeconds();
    const openParams = selectedServer ? [onlineSeconds, selectedServer] : [onlineSeconds];
    const openAnd = selectedServer ? 'AND server_id = $2' : '';
    const [
      players, sessions, openSessions, kills, killsPvp, killsLast24,
      shopRows, shopVolume, missions, missionsActive,
      eventsRaw, eventsUnprocessed, eventsLast24, bountiesActive, bountiesPending,
    ] = await Promise.all([
      db.query(selectedServer ? `SELECT COUNT(DISTINCT player_uid)::INT AS n FROM sessions WHERE server_id = $1` : `SELECT COUNT(*)::INT AS n FROM players`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM sessions ${where}`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM sessions s WHERE ${onlineSql('s', '$1')} ${openAnd}`, openParams),
      db.query(`SELECT COUNT(*)::INT AS n FROM kills ${where}`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM kills WHERE is_pvp = true ${and}`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM kills WHERE occurred_at > NOW() - INTERVAL '24 hours' ${and}`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM shop_events ${where}`, p),
      db.query(`SELECT COALESCE(SUM(price), 0)::BIGINT AS total FROM shop_events WHERE success = true ${and}`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM missions ${where}`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM missions WHERE ended_at IS NULL ${and}`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM events_raw ${where}`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM events_raw WHERE processed = false ${and}`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM events_raw WHERE received_at > NOW() - INTERVAL '24 hours' ${and}`, p),
      db.query(selectedServer ? `SELECT COUNT(*)::INT AS n FROM players pl WHERE bounty_active = true AND (pl.bounty_server_id = $1 OR (pl.bounty_server_id IS NULL AND EXISTS (SELECT 1 FROM sessions s WHERE s.player_uid = pl.uid AND s.server_id = $1)))` : `SELECT COUNT(*)::INT AS n FROM players WHERE bounty_active = true`, p),
      db.query(`SELECT COUNT(*)::INT AS n FROM bounty_events WHERE claimed = false ${and}`, p),
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
      online_grace_seconds: onlineSeconds,
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
  const countParams = [];
  if (claimed === 'true') conds.push('claimed = true');
  else if (claimed === 'false') conds.push('claimed = false');
  const selectedServer = serverFilter(req);
  if (selectedServer) {
    params.push(selectedServer);
    countParams.push(selectedServer);
    conds.push(`server_id = $${params.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const countConds = conds.map((cond) => selectedServer ? cond.replace(`$${params.length}`, `$${countParams.length}`) : cond);
  const countWhere = countConds.length ? 'WHERE ' + countConds.join(' AND ') : '';

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
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM bounty_events ${countWhere}`, countParams);
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// -------------------------------------------------------------------
// Manual payments queue
// -------------------------------------------------------------------
router.get('/payments/players', async (req, res) => {
  const limit = clampLimit(req.query.limit, 100, 300);
  const search = ilikePattern(req.query.search);
  const selectedServer = serverFilter(req);
  const onlineSeconds = onlineGraceSeconds();
  const params = [limit, onlineSeconds];
  const conds = [];
  if (search) {
    params.push(search);
    conds.push(`(p.name ILIKE $${params.length} OR p.uid ILIKE $${params.length})`);
  }

  let latestSessionFilter = '';
  if (selectedServer) {
    params.push(selectedServer);
    latestSessionFilter = `AND s.server_id = $${params.length}`;
    conds.push('ps.id IS NOT NULL');
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const r = await db.query(
      `SELECT p.uid, p.name, p.last_seen, p.current_balance, p.bank_balance, p.bank_last_seen,
              ps.server_id,
              COALESCE(ps.last_seen, ps.connected_at) AS session_last_seen,
              (${onlineSql('ps', '$2')}) AS online
         FROM players p
         LEFT JOIN LATERAL (
           SELECT s.id, s.server_id, s.connected_at, s.disconnected_at, s.last_seen
             FROM sessions s
            WHERE s.player_uid = p.uid
              ${latestSessionFilter}
            ORDER BY COALESCE(s.last_seen, s.disconnected_at, s.connected_at) DESC
            LIMIT 1
         ) ps ON true
         ${where}
        ORDER BY online DESC,
                 COALESCE(ps.last_seen, p.last_seen) DESC NULLS LAST,
                 p.name ASC
        LIMIT $1`,
      params
    );
    res.json({ rows: r.rows, online_grace_seconds: onlineSeconds });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.get('/payments', async (req, res) => {
  const limit = clampLimit(req.query.limit);
  const offset = clampOffset(req.query.offset);
  const claimed = req.query.claimed;
  const search = ilikePattern(req.query.search);
  const selectedServer = serverFilter(req);
  const params = [limit, offset];
  const countParams = [];
  const conds = [];
  const countConds = [];
  if (claimed === 'true') {
    conds.push('claimed = true');
    countConds.push('claimed = true');
  } else if (claimed === 'false') {
    conds.push('claimed = false');
    countConds.push('claimed = false');
  }
  if (search) {
    params.push(search);
    countParams.push(search);
    conds.push(`(player_name ILIKE $${params.length} OR player_uid ILIKE $${params.length})`);
    countConds.push(`(player_name ILIKE $${countParams.length} OR player_uid ILIKE $${countParams.length})`);
  }
  if (selectedServer) {
    params.push(selectedServer);
    countParams.push(selectedServer);
    conds.push(`server_id = $${params.length}`);
    countConds.push(`server_id = $${countParams.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const countWhere = countConds.length ? 'WHERE ' + countConds.join(' AND ') : '';

  try {
    const rowsR = await db.query(
      `SELECT id, created_at, server_id, player_uid, player_name, amount,
              note, claimed, claimed_at, claim_note, created_by
         FROM manual_payments
         ${where}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      params
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM manual_payments ${countWhere}`, countParams);
    res.json({ total: countR.rows[0].n, rows: rowsR.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.post('/payments', express.json(), async (req, res) => {
  const playerUid = String(req.body?.player_uid || '').trim();
  const serverId = normalizeServerId(req.body?.server_id);
  const amount = Math.round(clampNumber(req.body?.amount, 0, 1, 100_000_000));
  const note = String(req.body?.note || '').trim() || null;
  const createdBy = req.admin?.username || 'admin';

  if (!playerUid) return res.status(400).json({ error: 'player_uid is required' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be greater than zero' });

  try {
    await ensureServer(db, serverId);
    const playerR = await db.query(
      `SELECT uid, name
         FROM players
        WHERE uid = $1`,
      [playerUid]
    );
    const player = playerR.rows[0];
    if (!player) return res.status(404).json({ error: 'player not found' });

    const r = await db.query(
      `INSERT INTO manual_payments (
         server_id, player_uid, player_name, amount, note, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at, server_id, player_uid, player_name,
                 amount, note, claimed, claimed_at, claim_note, created_by`,
      [serverId, player.uid, player.name || 'Unknown', amount, note, createdBy]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'create failed', message: err.message });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    const r = await db.query(
      `DELETE FROM manual_payments
        WHERE id = $1 AND claimed = false
        RETURNING id, player_name, amount, server_id`,
      [Number(req.params.id) || 0]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'payment not found or already paid' });
    res.json({ deleted: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'delete failed', message: err.message });
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
  const selectedServer = serverFilter(req);

  const conds = [];
  const filterParams = [];
  if (search) {
    filterParams.push(search);
    conds.push(`(name ILIKE $${filterParams.length} OR uid ILIKE $${filterParams.length})`);
  }
  if (banned === 'true') conds.push('is_banned = true');
  else if (banned === 'false') conds.push('is_banned = false');
  if (selectedServer) {
    filterParams.push(selectedServer);
    conds.push(`EXISTS (SELECT 1 FROM sessions s WHERE s.player_uid = players.uid AND s.server_id = $${filterParams.length})`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rowsParams = [...filterParams, limit, offset];
  const limitIdx = filterParams.length + 1;
  const offsetIdx = filterParams.length + 2;

  try {
    const rowsR = await db.query(
      `SELECT uid, name, first_seen, last_seen, total_kills, total_deaths,
              deaths_pvp, deaths_zombie, deaths_bandit, deaths_env, deaths_suicide,
              longest_shot_m, longest_life_s, current_kill_streak, best_kill_streak,
              bounty_active, bounty_value, total_playtime_s, current_balance, bank_balance, bank_last_seen, is_banned
         FROM players
         ${where}
        ORDER BY last_seen DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowsParams
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM players ${where}`, filterParams);
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

router.get('/players/:uid/bank', async (req, res) => {
  const selectedServer = serverFilter(req);
  const limit = clampLimit(req.query.limit, 100, 200);
  const day = String(req.query.day || '').trim();
  const txParams = [req.params.uid, limit];
  const serverWhere = selectedServer ? `AND server_id = $3` : '';
  if (selectedServer) txParams.push(selectedServer);
  let dayWhere = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    txParams.push(day);
    dayWhere = `AND (occurred_at AT TIME ZONE 'America/Manaus')::date = $${txParams.length}::date`;
  }

  try {
    const playerR = await db.query(
      `SELECT uid, name, current_balance, bank_balance, bank_last_seen, last_seen
         FROM players
        WHERE uid = $1`,
      [req.params.uid]
    );
    const player = playerR.rows[0];
    if (!player) return res.status(404).json({ error: 'not found' });

    const txR = await db.query(
      `SELECT id, occurred_at, server_id, transaction_type, amount,
              bank_before, bank_after, cash_balance, total_balance, source
         FROM bank_transactions
        WHERE player_uid = $1
          AND source <> 'sync_delta'
          ${serverWhere}
          ${dayWhere}
        ORDER BY occurred_at DESC
        LIMIT $2`,
      txParams
    );

    let serverSummary = null;
    if (selectedServer) {
      const latestTxR = await db.query(
        `SELECT occurred_at, bank_after, cash_balance, total_balance, source
           FROM bank_transactions
          WHERE player_uid = $1
            AND server_id = $2
            AND source <> 'sync_delta'
          ORDER BY occurred_at DESC
          LIMIT 1`,
        [req.params.uid, selectedServer]
      );
      const latestSyncR = await db.query(
        `SELECT received_at,
                NULLIF(payload->>'cash_balance', '')::INT AS cash_balance
           FROM events_raw
          WHERE server_id = $1
            AND event_type = 'player_bank_sync'
            AND payload->'player'->>'uid' = $2
            AND payload ? 'cash_balance'
          ORDER BY received_at DESC
          LIMIT 1`,
        [selectedServer, req.params.uid]
      );
      const latestTx = latestTxR.rows[0] || null;
      const latestSync = latestSyncR.rows[0] || null;
      const txTime = latestTx?.occurred_at ? new Date(latestTx.occurred_at).getTime() : 0;
      const syncTime = latestSync?.received_at ? new Date(latestSync.received_at).getTime() : 0;
      const cashFromSync = latestSync?.cash_balance != null && syncTime >= txTime;

      serverSummary = {
        server_id: selectedServer,
        bank_balance: latestTx?.bank_after ?? null,
        cash_balance: cashFromSync ? latestSync.cash_balance : (latestTx?.cash_balance ?? latestSync?.cash_balance ?? null),
        total_balance: null,
        last_bank_seen: latestTx?.occurred_at || null,
        last_cash_seen: cashFromSync ? latestSync.received_at : (latestTx?.occurred_at || latestSync?.received_at || null),
        has_bank_activity: !!latestTx,
        has_cash_activity: !!(latestTx || latestSync),
      };
      if (serverSummary.bank_balance != null && serverSummary.cash_balance != null) {
        serverSummary.total_balance = Number(serverSummary.bank_balance) + Number(serverSummary.cash_balance);
      }
    }

    const serverR = selectedServer
      ? await db.query(`SELECT id, name FROM servers WHERE id = $1`, [selectedServer])
      : { rows: [] };

    res.json({
      selected_server: selectedServer,
      selected_server_name: serverR.rows[0]?.name || selectedServer || null,
      player,
      server_summary: serverSummary,
      transactions: txR.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.patch('/players/:uid', express.json(), async (req, res) => {
  const {
    name,
    is_banned,
    reset_stats,
    bounty_active,
    bounty_value,
    bounty_server_id,
    current_kill_streak,
  } = req.body || {};
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
  if (typeof bounty_active === 'boolean') {
    params.push(bounty_active);
    sets.push(`bounty_active = $${params.length}`);
    if (bounty_active)
      sets.push(`bounty_started_at = COALESCE(bounty_started_at, NOW()), bounty_streak = GREATEST(bounty_streak, current_kill_streak)`);
    else
      sets.push(`bounty_started_at = NULL, bounty_server_id = NULL, bounty_value = 0, bounty_streak = 0`);
  }
  if (bounty_value !== undefined) {
    const bountyValue = clampNumber(bounty_value, 0, 0, 10000000);
    params.push(Math.round(bountyValue));
    sets.push(`bounty_value = $${params.length}`);
  }
  if (typeof bounty_server_id === 'string') {
    const serverId = normalizeServerId(bounty_server_id);
    await ensureServer(db, serverId);
    params.push(serverId);
    sets.push(`bounty_server_id = $${params.length}`);
  }
  if (current_kill_streak !== undefined) {
    const streak = clampNumber(current_kill_streak, 0, 0, 100000);
    params.push(Math.round(streak));
    sets.push(`current_kill_streak = $${params.length}`);
  }
  if (reset_stats === true) {
    sets.push(`total_kills = 0, total_deaths = 0, deaths_pvp = 0, deaths_zombie = 0,
               deaths_bandit = 0, deaths_env = 0, deaths_suicide = 0,
               longest_shot_m = 0, longest_life_s = 0,
               current_kill_streak = 0, best_kill_streak = 0,
               bounty_active = false, bounty_value = 0, bounty_streak = 0, bounty_started_at = NULL, bounty_server_id = NULL`);
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
  const selectedServer = serverFilter(req);

  const conds = [];
  const filterParams = [];
  if (search) {
    filterParams.push(search);
    conds.push(`(victim_name ILIKE $${filterParams.length} OR killer_name ILIKE $${filterParams.length} OR weapon_name ILIKE $${filterParams.length})`);
  }
  if (killerType) {
    filterParams.push(String(killerType));
    conds.push(`killer_type = $${filterParams.length}`);
  }
  if (selectedServer) {
    filterParams.push(selectedServer);
    conds.push(`server_id = $${filterParams.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rowsParams = [...filterParams, limit, offset];
  const limitIdx = filterParams.length + 1;
  const offsetIdx = filterParams.length + 2;

  try {
    const rowsR = await db.query(
      `SELECT id, occurred_at, server_id, victim_uid, victim_name, killer_type, killer_uid, killer_name,
              weapon_name, distance_m, is_pvp, is_suicide, victim_alive_s
         FROM kills
         ${where}
        ORDER BY occurred_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowsParams
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM kills ${where}`, filterParams);
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
  const selectedServer = serverFilter(req);

  const conds = [];
  const filterParams = [];
  if (search) {
    filterParams.push(search);
    conds.push(`(player_name ILIKE $${filterParams.length} OR item_name ILIKE $${filterParams.length})`);
  }
  if (isPurchase === 'true') conds.push('is_purchase = true');
  else if (isPurchase === 'false') conds.push('is_purchase = false');
  if (selectedServer) {
    filterParams.push(selectedServer);
    conds.push(`server_id = $${filterParams.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rowsParams = [...filterParams, limit, offset];
  const limitIdx = filterParams.length + 1;
  const offsetIdx = filterParams.length + 2;

  try {
    const rowsR = await db.query(
      `SELECT id, occurred_at, server_id, player_uid, player_name, item_name, item_prefab,
              quantity, is_purchase, success, price, balance_after
         FROM shop_events
         ${where}
        ORDER BY occurred_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowsParams
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM shop_events ${where}`, filterParams);
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
  const selectedServer = serverFilter(req);

  const conds = [];
  const filterParams = [];
  if (search) {
    filterParams.push(search);
    conds.push(`mission_name ILIKE $${filterParams.length}`);
  }
  if (active === 'true') conds.push('ended_at IS NULL');
  else if (active === 'false') conds.push('ended_at IS NOT NULL');
  if (selectedServer) {
    filterParams.push(selectedServer);
    conds.push(`server_id = $${filterParams.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rowsParams = [...filterParams, limit, offset];
  const limitIdx = filterParams.length + 1;
  const offsetIdx = filterParams.length + 2;

  try {
    const rowsR = await db.query(
      `SELECT id, server_id, started_at, ended_at, sub_idx, mission_name, won, cooldown_s
         FROM missions
         ${where}
        ORDER BY started_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowsParams
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM missions ${where}`, filterParams);
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
  const selectedServer = serverFilter(req);

  const conds = [];
  const filterParams = [];
  if (type) {
    filterParams.push(String(type));
    conds.push(`event_type = $${filterParams.length}`);
  }
  if (processed === 'true') conds.push('processed = true');
  else if (processed === 'false') conds.push('processed = false');
  if (hasError === 'true') conds.push('error IS NOT NULL');
  if (selectedServer) {
    filterParams.push(selectedServer);
    conds.push(`server_id = $${filterParams.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rowsParams = [...filterParams, limit, offset];
  const limitIdx = filterParams.length + 1;
  const offsetIdx = filterParams.length + 2;

  try {
    const rowsR = await db.query(
      `SELECT id, received_at, server_id, event_type, timestamp_unix, processed, error, payload
         FROM events_raw
         ${where}
        ORDER BY received_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowsParams
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM events_raw ${where}`, filterParams);
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
  const selectedServer = serverFilter(req);
  const onlineSeconds = onlineGraceSeconds();

  const conds = ['($1::INT IS NOT NULL)'];
  const filterParams = [onlineSeconds];
  if (open === 'true') conds.push(`(${onlineSql('s', '$1')})`);
  else if (open === 'false') conds.push(`NOT (${onlineSql('s', '$1')})`);
  if (selectedServer) {
    filterParams.push(selectedServer);
    conds.push(`s.server_id = $${filterParams.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rowsParams = [...filterParams, limit, offset];
  const limitIdx = filterParams.length + 1;
  const offsetIdx = filterParams.length + 2;

  try {
    const rowsR = await db.query(
      `SELECT s.id, s.server_id, s.player_uid, p.name AS player_name, s.connected_at, s.disconnected_at,
              s.last_seen, (${onlineSql('s', '$1')}) AS online,
              s.duration_s, s.spawn_point, s.balance_in, s.balance_out
         FROM sessions s
         LEFT JOIN players p ON p.uid = s.player_uid
         ${where}
        ORDER BY COALESCE(s.last_seen, s.connected_at) DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowsParams
    );
    const countR = await db.query(`SELECT COUNT(*)::INT AS n FROM sessions s ${where}`, filterParams);
    res.json({ total: countR.rows[0].n, rows: rowsR.rows, online_grace_seconds: onlineSeconds });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
