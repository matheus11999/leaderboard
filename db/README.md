# DB schema

PostgreSQL 16. Scripts in `migrations/` are run by the official `postgres:16-alpine` image on first init (mounted at `/docker-entrypoint-initdb.d`). They run in alphabetical order: `001_init.sql`, `002_indexes.sql`, `003_views.sql`.

## Tables

| Table | Purpose |
|---|---|
| `players` | Canonical identity by Reforger UID + aggregated counters |
| `sessions` | One row per connect→disconnect, holds spawn point + balance snapshots |
| `kills` | Every death event, used for kill feed + leaderboard derivation |
| `shop_events` | Buy/sell transactions for economy stats |
| `missions` | Started/ended mission rows |
| `events_raw` | Idempotency + audit log of every webhook envelope received |
| `admin_users` | Bcrypt-hashed admin login for JWT auth |

## Views (materialized, refreshed 60s)

- `v_top_kills_pvp` — top 100 PvP killers
- `v_longest_shots` — top 100 longest-distance PvP kills
- `v_longest_life` — top 100 longest survival times before death

Refresh is handled by the API on a 60s `setInterval` using `REFRESH MATERIALIZED VIEW CONCURRENTLY` so reads stay non-blocking.

## Re-running migrations

Migrations only run on a fresh database. If you change schema, either:
- Delete the `pgdata` volume and restart, or
- Apply ad-hoc DDL via `docker exec -it brasilz-db psql -U brasilz -d brasilz_portal`.
