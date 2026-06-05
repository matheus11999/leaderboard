#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-brasilz}"
POSTGRES_DB="${POSTGRES_DB:-brasilz_portal}"

mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_file="$BACKUP_DIR/.brasilz_portal_$stamp.dump.tmp"
out_file="$BACKUP_DIR/brasilz_portal_$stamp.dump"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting PostgreSQL backup: $out_file"
pg_dump \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -F c \
  -f "$tmp_file"
mv "$tmp_file" "$out_file"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup completed: $out_file"

find "$BACKUP_DIR" -type f -name 'brasilz_portal_*.dump' -mtime "+$BACKUP_RETENTION_DAYS" -delete
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Retention applied: ${BACKUP_RETENTION_DAYS} days"
