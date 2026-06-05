# How to deploy the BrasilZ leaderboard with Portainer

This project runs as Portainer stack `brasilz-leaderboard` on endpoint `local` (`endpointId=3`, `stackId=4`).

## Production targets

- Public site: `https://brasilz.encurtalink.pro`
- Arma HTTP API by IP:
  - `http://62.171.171.45/v1/arma/events`
  - `http://62.171.171.45/v1/arma/rewards`
- Portainer: `https://62.171.171.45:9443`
- Stack path on host: `/data/compose/4`
- Compose project name: `brasilz-leaderboard`
- Git repository: `https://github.com/matheus11999/leaderboard.git`
- Branch: `main`

## Critical rule

When using a helper container with `/var/run/docker.sock`, run `docker compose` from the host path mounted at the same path:

```sh
cd /data/compose/4
docker compose -p brasilz-leaderboard up -d --build --remove-orphans
```

Do not mount `/data/compose/4` as `/work` and then run compose from `/work`. Docker bind mounts are resolved on the host, so compose will try to mount `/work/nginx/default.conf` on the host and nginx will fail with:

```text
error mounting "/work/nginx/default.conf" ... not a directory
```

## Deploy steps

1. Commit and push local changes to GitHub `main`.

```powershell
git -C "C:\Users\Alienware\Projects\brasilz-leaderboard" status --short
git -C "C:\Users\Alienware\Projects\brasilz-leaderboard" add <files>
git -C "C:\Users\Alienware\Projects\brasilz-leaderboard" commit -m "<message>"
git -C "C:\Users\Alienware\Projects\brasilz-leaderboard" push
```

2. Authenticate with Portainer.

```powershell
$base = "https://62.171.171.45:9443"
$body = @{ Username = "admin"; Password = "<PORTAINER_PASSWORD>" } | ConvertTo-Json
$auth = Invoke-RestMethod -Uri "$base/api/auth" -Method Post -Body $body -ContentType "application/json"
$auth.jwt | Set-Content "$env:TEMP\brasilz_portainer_jwt.txt" -NoNewline
```

PowerShell 5 may need the self-signed certificate bypass before API calls:

```powershell
Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int certificateProblem) { return true; }
}
"@ -ErrorAction SilentlyContinue
[System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
```

3. Run a helper container that updates `/data/compose/4` from GitHub and redeploys from the correct host path.

```sh
set -eu
apk add --no-cache git rsync >/dev/null
stamp=$(date +%Y%m%d%H%M%S)
mkdir -p /data/compose/backups
cp -a /data/compose/4 "/data/compose/backups/4_before_deploy_$stamp"
rm -rf /tmp/brasilz-src
git clone --depth 1 --branch main https://github.com/matheus11999/leaderboard.git /tmp/brasilz-src
rsync -a --delete --exclude .git /tmp/brasilz-src/ /data/compose/4/
cd /data/compose/4
echo "Deploying commit $(git --git-dir=/tmp/brasilz-src/.git rev-parse --short HEAD)"
docker compose -p brasilz-leaderboard up -d --build --remove-orphans
```

The helper container needs these binds:

```text
/var/run/docker.sock:/var/run/docker.sock
/data/compose:/data/compose:rw
```

And these stack environment variables:

```text
DB_PASSWORD=...
INGEST_API_KEY=...
JWT_SECRET=...
ADMIN_USER=admin
ADMIN_PASSWORD=...
```

## Validate after deploy

Check the site and API:

```powershell
curl.exe -s -L -o $env:TEMP\brasilz_health.json -w "%{http_code}" "https://brasilz.encurtalink.pro/api/admin/health"
curl.exe -s -L -o $env:TEMP\brasilz_admin.js -w "%{http_code}" "https://brasilz.encurtalink.pro/admin/admin.js"
```

Check Arma reward endpoint by IP:

```powershell
$body = @{ api_key = "<INGEST_API_KEY>"; server_id = "brasilz-testes"; limit = 1 } | ConvertTo-Json -Compress
$file = "$env:TEMP\pending.json"
Set-Content $file $body -NoNewline -Encoding UTF8
curl.exe -s -o $env:TEMP\pending-response.json -w "%{http_code}" -H "Content-Type: application/json" --data-binary "@$file" "http://62.171.171.45/v1/arma/rewards/pending"
```

Expected:

- Admin health: `200`
- Admin JS: `200`
- Pending rewards by IP: `200`

## Database backup

The stack has a `brasilz-db-backup` container. It runs once per day at
`08:00 UTC` (`04:00 America/Manaus`) and writes dumps to:

```text
/data/compose/4/backups/postgres
```

Files are named like:

```text
brasilz_portal_20260605T080000Z.dump
```

To force a manual backup from Portainer/host:

```sh
docker exec brasilz-db-backup sh /usr/local/bin/backup-postgres.sh
```

To list backups:

```sh
docker exec brasilz-db-backup ls -lh /backups
```

Default retention is 14 days. Override with `BACKUP_RETENTION_DAYS` in the stack
environment if needed.

## Caddy/proxy note

Host ports `80/443` are owned by container `/turbozap_caddy`.

Its Caddyfile is mounted from:

```text
/opt/turbozap/deploy/Caddyfile
```

The IP route for Arma API is intentionally HTTP-only:

```caddyfile
http://62.171.171.45 {
    @arma path /v1/arma/events* /v1/arma/rewards*

    handle @arma {
        reverse_proxy brasilz-nginx:80
    }

    handle {
        redir https://brasilz.encurtalink.pro{uri} 308
    }
}
```

Do not expose nginx directly on host port 80. It should only join `shared_proxy`.
