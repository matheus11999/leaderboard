'use strict';

const DEFAULT_SERVER_ID = 'brasilz-main';

function normalizeServerId(raw) {
  const value = String(raw || '').trim();
  return value || DEFAULT_SERVER_ID;
}

function slugifyServerId(raw) {
  const value = normalizeServerId(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value || DEFAULT_SERVER_ID;
}

function serverFilter(req) {
  const raw = req.query.server_id || req.query.server || req.query.slug;
  const value = String(raw || '').trim();
  return value || null;
}

async function ensureServer(dbOrClient, rawId, name) {
  const id = normalizeServerId(rawId);
  const displayName = String(name || id).trim() || id;
  const slug = slugifyServerId(id);
  await dbOrClient.query(
    `INSERT INTO servers (id, name, slug, public_enabled, is_default)
     VALUES ($1, $2, $3, true, $4)
     ON CONFLICT (id) DO UPDATE SET
       name = COALESCE(NULLIF(servers.name, ''), EXCLUDED.name),
       slug = COALESCE(NULLIF(servers.slug, ''), EXCLUDED.slug),
       updated_at = NOW()`,
    [id, displayName, slug, id === DEFAULT_SERVER_ID]
  );
  return id;
}

module.exports = {
  DEFAULT_SERVER_ID,
  normalizeServerId,
  slugifyServerId,
  serverFilter,
  ensureServer,
};
