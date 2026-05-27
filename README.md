# BrasilZ Leaderboard

Receiver API + leaderboard portal for the BrasilZ Arma Reforger server.

Receives webhook events from the BrasilZ mod (`POST /v1/arma/events`), stores them in PostgreSQL, and exposes a public leaderboard plus an authenticated admin dashboard.

## Stack

- **Node.js 20** + Express
- **PostgreSQL 16**
- **Nginx** (reverse proxy, optional TLS)
- **Docker Compose**

## Quick Start (local dev)

```bash
cp .env.example .env
# edit .env with strong secrets
docker compose up -d
# API at http://localhost:80
# Health: curl http://localhost/admin/health
```

## Endpoints

### Ingest (server-only, requires `X-BrasilZ-Api-Key` header)
- `POST /v1/arma/events` — receive any event envelope

### Public (read-only)
- `GET /api/leaderboard?type=pvp_kills&limit=20`
  - types: `pvp_kills`, `longest_shot`, `longest_life`, `most_deaths`, `total_playtime`
- `GET /api/killfeed?limit=50`
- `GET /api/players/:uid`
- `GET /api/stats/server`

### Admin (JWT auth)
- `POST /admin/login` body `{username, password}` → `{token}` (also sets `token` cookie)
- `GET /admin/me`
- `GET /admin/events?type=&limit=`
- `GET /admin/players/:uid/sessions`
- `POST /admin/players/:uid/ban`
- `GET /admin/health` (public health check)

## Portainer Deploy (Git Stack)

1. Portainer UI → Stacks → **Add stack**
2. **Build method:** Repository
3. **Repository URL:** `https://github.com/matheus11999/leaderboard.git`
4. **Reference:** `refs/heads/main`
5. **Compose path:** `docker-compose.yml`
6. Set env vars in UI:
   - `DB_PASSWORD`
   - `INGEST_API_KEY`
   - `JWT_SECRET`
   - `ADMIN_USER` (default `admin`)
   - `ADMIN_PASSWORD`
7. Deploy

## Repo layout

```
.
├── docker-compose.yml
├── .env.example
├── api/                    # Node Express receiver + public API
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js        # bootstrap + admin seed
│       ├── db.js           # pg pool
│       ├── auth.js         # JWT middleware
│       ├── routes/         # ingest, leaderboard, killfeed, players, admin
│       ├── processors/     # one per event_type
│       └── lib/            # safeCompare, logger
├── db/
│   └── migrations/         # 001_init, 002_indexes, 003_views (auto-run by postgres image)
└── nginx/
    └── default.conf        # reverse proxy 80 → api:3000
```

## Webhook contract

See [`BrasilZ mod README_PortalWebhook.md`](https://github.com/) for the full event envelope and per-event payload schema.

Events handled:
- `player_connected` / `player_disconnected` / `player_spawned` / `player_killed`
- `shop_purchase` / `shop_purchase_failed` / `shop_sale`
- `mission_started` / `mission_ended`

## Portal rewards and bounty config

Server-only endpoints protected by `X-BrasilZ-Api-Key`:

- `GET /v1/arma/rewards/pending?server_id=brasilz-main`
- `POST /v1/arma/rewards/claim`
- `GET/PATCH /admin/bounty/settings`
- `GET /admin/bounty/rewards?claimed=true|false`

The mod reads `$profile:BrasilZ/Portal/Config.json`. New installs generate empty
`endpoint_url`, `rewards_url`, and `api_key` values so secrets stay outside the
source code.

```json
{
  "endpoint_url": "https://your-domain/v1/arma/events",
  "rewards_url": "https://your-domain/v1/arma/rewards",
  "api_key": "<INGEST_API_KEY value>",
  "server_id": "brasilz-main",
  "schema_version": "1.0",
  "rewards_poll_interval_ms": 30000
}
```

If `rewards_url` is blank, the mod derives it from `endpoint_url`. The admin
BOUNTY tab controls the minimum PvP streak, starting reward, and percentage
increase per extra kill. When a hunted player dies to another player, the API
creates a pending reward; the mod pays the online hunter wallet and then marks
the reward as claimed.

## Frontend

Deferred — endpoints stable, design coming later. Any static SPA can call `/api/*` for public ranking and `/admin/login` for the admin area.
