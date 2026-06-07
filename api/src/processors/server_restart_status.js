'use strict';

const db = require('../db');

module.exports = async function serverRestartStatus(data, envelope) {
  const restartAtUnix = Number(data.restart_at_unix) || null;
  const secondsUntilRestart = Math.max(0, Number(data.seconds_until_restart) || 0);
  const startupUnix = Number(data.startup_unix) || null;
  const reason = String(data.reason || '').slice(0, 80);

  await db.query(
    `INSERT INTO server_status (
       server_id,
       restart_at_unix,
       seconds_until_restart,
       startup_unix,
       shutdown_in_progress,
       restart_triggered,
       manual_restart,
       reason,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (server_id) DO UPDATE SET
       restart_at_unix = EXCLUDED.restart_at_unix,
       seconds_until_restart = EXCLUDED.seconds_until_restart,
       startup_unix = EXCLUDED.startup_unix,
       shutdown_in_progress = EXCLUDED.shutdown_in_progress,
       restart_triggered = EXCLUDED.restart_triggered,
       manual_restart = EXCLUDED.manual_restart,
       reason = EXCLUDED.reason,
       updated_at = NOW()`,
    [
      envelope.server_id,
      restartAtUnix,
      secondsUntilRestart,
      startupUnix,
      Boolean(data.shutdown_in_progress),
      Boolean(data.restart_triggered),
      Boolean(data.manual_restart),
      reason,
    ]
  );
};
