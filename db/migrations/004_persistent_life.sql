-- Persist current life start so reconnects/restarts do not reset longest-life.

BEGIN;

ALTER TABLE players ADD COLUMN IF NOT EXISTS life_started_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS life_server_id TEXT;

CREATE INDEX IF NOT EXISTS idx_players_life_started
  ON players (life_server_id, life_started_at)
  WHERE life_started_at IS NOT NULL;

COMMIT;
