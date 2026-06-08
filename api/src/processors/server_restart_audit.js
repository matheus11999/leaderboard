'use strict';

const db = require('../db');

function str(v, max = 500) {
  return String(v == null ? '' : v).slice(0, max);
}

function bool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function eventTime(envelope) {
  const unix = Number(envelope?.timestamp_unix) || 0;
  if (unix > 0) return new Date(unix * 1000);
  return new Date();
}

async function findOrCreateRestart(c, data, envelope) {
  const serverId = envelope.server_id;
  const restartAtUnix = Number(data.restart_at_unix) || null;
  const startupUnix = Number(data.startup_unix) || null;
  const restartKey = str(data.restart_key || (restartAtUnix ? `restart_${restartAtUnix}` : `restart_${Math.floor(Date.now() / 1000)}`), 120);
  const phase = str(data.phase || data.status || 'audit', 80);
  const status = phase.includes('complete') || phase.includes('closed') ? 'complete' : (bool(data.shutdown_in_progress) ? 'shutdown' : 'active');
  const startedAt = eventTime(envelope);

  const r = await c.query(
    `INSERT INTO server_restarts (
       server_id, restart_key, started_at, status, reason, manual_restart,
       restart_at_unix, startup_unix, player_count, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (server_id, restart_key) DO UPDATE SET
       status = CASE
         WHEN EXCLUDED.status = 'complete' THEN 'complete'
         WHEN server_restarts.status = 'complete' THEN server_restarts.status
         ELSE EXCLUDED.status
       END,
       ended_at = CASE WHEN EXCLUDED.status = 'complete' THEN NOW() ELSE server_restarts.ended_at END,
       reason = COALESCE(NULLIF(EXCLUDED.reason, ''), server_restarts.reason),
       manual_restart = server_restarts.manual_restart OR EXCLUDED.manual_restart,
       restart_at_unix = COALESCE(EXCLUDED.restart_at_unix, server_restarts.restart_at_unix),
       startup_unix = COALESCE(EXCLUDED.startup_unix, server_restarts.startup_unix),
       player_count = GREATEST(server_restarts.player_count, EXCLUDED.player_count),
       updated_at = NOW()
     RETURNING id`,
    [
      serverId,
      restartKey,
      startedAt,
      status,
      str(data.reason || phase, 200),
      bool(data.manual_restart),
      restartAtUnix,
      startupUnix,
      Math.max(0, Number(data.player_count) || (Array.isArray(data.players) ? data.players.length : 0)),
    ]
  );
  return { id: r.rows[0].id, restartKey, phase };
}

async function insertEvent(c, restartId, envelope, data, phase, player = null) {
  const playerData = player || data.player || {};
  const severity = str(player?.severity || data.severity || (String(data.phase || '').includes('failed') ? 'error' : 'info'), 24) || 'info';
  const reason = str(player?.reason || data.reason || data.phase || '', 500);
  await c.query(
    `INSERT INTO server_restart_events (
       restart_id, server_id, occurred_at, event_type, phase, severity,
       player_id, player_uid, player_name, reason, details
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      restartId,
      envelope.server_id,
      eventTime(envelope),
      envelope.event_type,
      phase,
      severity,
      Number(playerData.player_id) || null,
      str(playerData.uid || playerData.player_uid || '', 120) || null,
      str(playerData.name || playerData.player_name || '', 160) || null,
      reason,
      JSON.stringify(player || data || {}),
    ]
  );
}

async function refreshCounters(c, restartId) {
  await c.query(
    `UPDATE server_restarts r SET
       saved_count = COALESCE(x.saved_count, 0),
       snapshot_count = COALESCE(x.snapshot_count, 0),
       snapshot_restore_count = COALESCE(x.snapshot_restore_count, 0),
       queue_reject_count = COALESCE(x.queue_reject_count, 0),
       error_count = COALESCE(x.error_count, 0),
       updated_at = NOW()
     FROM (
       SELECT
         COUNT(*) FILTER (WHERE event_type = 'server_restart_audit' AND (details->>'character_saved')::BOOL IS TRUE)::INT AS saved_count,
         COUNT(*) FILTER (WHERE event_type IN ('server_restart_audit', 'server_restore_audit') AND (details->>'snapshot_saved')::BOOL IS TRUE)::INT AS snapshot_count,
         COUNT(*) FILTER (WHERE event_type = 'server_restore_audit' AND phase IN ('snapshot_restored', 'snapshot_login_applied'))::INT AS snapshot_restore_count,
         COUNT(*) FILTER (WHERE event_type = 'server_restore_audit' AND phase IN ('queue_rejected', 'restore_kicked'))::INT AS queue_reject_count,
         COUNT(*) FILTER (WHERE severity IN ('error', 'warning'))::INT AS error_count
       FROM server_restart_events
       WHERE restart_id = $1
     ) x
     WHERE r.id = $1`,
    [restartId]
  );
}

module.exports = async function serverRestartAudit(data, envelope) {
  await db.tx(async (c) => {
    const restart = await findOrCreateRestart(c, data, envelope);
    await insertEvent(c, restart.id, envelope, data, restart.phase);

    if (Array.isArray(data.players)) {
      for (const player of data.players) {
        await insertEvent(c, restart.id, envelope, data, restart.phase, player);
      }
    }

    await refreshCounters(c, restart.id);
  });
};
