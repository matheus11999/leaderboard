-- BrasilZ Leaderboard — materialized views for ranking pages.
-- Refreshed by the API every 60s via setInterval (see api/src/index.js).

BEGIN;

-- Top 100 PvP killers
CREATE MATERIALIZED VIEW IF NOT EXISTS v_top_kills_pvp AS
SELECT
  killer_uid AS uid,
  killer_name AS name,
  COUNT(*)::INT AS kills
FROM kills
WHERE is_pvp = true AND killer_uid IS NOT NULL
GROUP BY killer_uid, killer_name
ORDER BY kills DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_top_kills_pvp_uid ON v_top_kills_pvp (uid);

-- Top 100 longest shots (PvP only)
CREATE MATERIALIZED VIEW IF NOT EXISTS v_longest_shots AS
SELECT
  id,
  killer_uid AS uid,
  killer_name AS name,
  victim_name,
  weapon_name,
  distance_m,
  occurred_at
FROM kills
WHERE distance_m > 0 AND is_pvp = true
ORDER BY distance_m DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_longest_shots_id ON v_longest_shots (id);

-- Top 100 longest survival times
CREATE MATERIALIZED VIEW IF NOT EXISTS v_longest_life AS
SELECT
  id,
  victim_uid AS uid,
  victim_name AS name,
  victim_alive_s AS seconds,
  occurred_at
FROM kills
WHERE victim_alive_s > 0
ORDER BY victim_alive_s DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_longest_life_id ON v_longest_life (id);

COMMIT;
