'use strict';

const db = require('../db');

function str(v, max = 500) {
  return String(v == null ? '' : v).slice(0, max);
}

function eventTime(envelope) {
  const unix = Number(envelope?.timestamp_unix) || 0;
  if (unix > 0) return new Date(unix * 1000);
  return new Date();
}

async function findRestart(c, data, envelope) {
  const restartKey = str(data.restart_key || '', 120);
  if (restartKey) {
    const byKey = await c.query(
      `SELECT id FROM server_restarts WHERE server_id = $1 AND restart_key = $2 LIMIT 1`,
      [envelope.server_id, restartKey]
    );
    if (byKey.rows[0]) return byKey.rows[0].id;
  }

  const recent = await c.query(
    `SELECT id
       FROM server_restarts
      WHERE server_id = $1
        AND started_at > NOW() - INTERVAL '45 minutes'
      ORDER BY started_at DESC
      LIMIT 1`,
    [envelope.server_id]
  );
  return recent.rows[0]?.id || null;
}

async function findOrCreateRestoreSession(c, data, envelope) {
  const existingId = await findRestart(c, data, envelope);
  if (existingId) return existingId;

  const occurredAt = eventTime(envelope);
  const restoreKey = str(
    data.restart_key || `restore_${envelope.server_id}_${Math.floor(occurredAt.getTime() / 1000 / 1800)}`,
    120
  );

  const r = await c.query(
    `INSERT INTO server_restarts (
       server_id, restart_key, started_at, status, reason, manual_restart,
       restart_at_unix, startup_unix, player_count, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, FALSE, NULL, NULL, 0, NOW())
     ON CONFLICT (server_id, restart_key) DO UPDATE SET
       updated_at = NOW(),
       player_count = GREATEST(server_restarts.player_count, 1)
     RETURNING id`,
    [
      envelope.server_id,
      restoreKey,
      occurredAt,
      'active',
      'restore audit',
    ]
  );
  return r.rows[0].id;
}

async function refreshCounters(c, restartId) {
  if (!restartId) return;
  await c.query(
    `UPDATE server_restarts r SET
       snapshot_count = COALESCE(x.snapshot_count, 0),
       snapshot_restore_count = COALESCE(x.snapshot_restore_count, 0),
       queue_reject_count = COALESCE(x.queue_reject_count, 0),
       error_count = COALESCE(x.error_count, 0),
       updated_at = NOW()
     FROM (
       SELECT
         COUNT(*) FILTER (WHERE (details->>'snapshot_saved')::BOOL IS TRUE)::INT AS snapshot_count,
         COUNT(*) FILTER (WHERE phase = 'snapshot_restored')::INT AS snapshot_restore_count,
         COUNT(*) FILTER (WHERE phase IN ('queue_rejected', 'restore_kicked'))::INT AS queue_reject_count,
         COUNT(*) FILTER (WHERE severity IN ('error', 'warning'))::INT AS error_count
       FROM server_restart_events
       WHERE restart_id = $1
     ) x
     WHERE r.id = $1`,
    [restartId]
  );
}

module.exports = async function serverRestoreAudit(data, envelope) {
  await db.tx(async (c) => {
    const restartId = await findOrCreateRestoreSession(c, data, envelope);
    const player = data.player || {};
    const phase = str(data.phase || 'restore_event', 80);
    const severity = str(data.severity || (phase.includes('failed') || phase.includes('unsafe') || phase.includes('kick') ? 'warning' : 'info'), 24) || 'info';

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
        Number(player.player_id) || null,
        str(player.uid || '', 120) || null,
        str(player.name || '', 160) || null,
        str(data.reason || '', 500),
        JSON.stringify(data || {}),
      ]
    );

    await refreshCounters(c, restartId);
  });
};
