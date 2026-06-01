'use strict';

const DEFAULT_ONLINE_GRACE_SECONDS = 600;

function onlineGraceSeconds() {
  const raw = process.env.ONLINE_GRACE_SECONDS || process.env.ONLINE_TTL_SECONDS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60) return DEFAULT_ONLINE_GRACE_SECONDS;
  return Math.min(86400, Math.floor(n));
}

function onlineSql(alias = 's', param = '$1') {
  return `${alias}.disconnected_at IS NULL
    AND COALESCE(${alias}.last_seen, ${alias}.connected_at) >= NOW() - (${param}::INT * INTERVAL '1 second')`;
}

module.exports = { onlineGraceSeconds, onlineSql };
