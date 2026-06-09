'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const SftpClient = require('ssh2-sftp-client');

const db = require('../db');
const logger = require('./logger');

const BACKUP_ROOT = process.env.SERVER_BACKUP_DIR || path.resolve(process.cwd(), 'server-backups');
const TICK_MS = 60_000;
let schedulerStarted = false;
let schedulerBusy = false;

function key() {
  const secret = process.env.BACKUP_CRYPTO_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('missing BACKUP_CRYPTO_SECRET/JWT_SECRET');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(value) {
  const plain = String(value || '');
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptSecret(value) {
  if (!value) return '';
  const raw = Buffer.from(value, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function sanitizeSegment(value) {
  return String(value || 'server').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'server';
}

function normalizeRemotePath(value) {
  const p = String(value || '/home/container/profile/profile').trim();
  return p.startsWith('/') ? p.replace(/\/+$/, '') : '/' + p.replace(/\/+$/, '');
}

function publicConfig(row) {
  if (!row) return null;
  return {
    server_id: row.server_id,
    host: row.host || '',
    port: Number(row.port || 22),
    username: row.username || '',
    remote_path: row.remote_path || '/home/container/profile/profile',
    enabled: !!row.enabled,
    schedule_minutes: Number(row.schedule_minutes || 60),
    has_password: !!row.password_enc,
    last_test_ok: row.last_test_ok,
    last_test_at: row.last_test_at,
    last_test_error: row.last_test_error,
    last_backup_at: row.last_backup_at,
    last_backup_status: row.last_backup_status,
    last_backup_error: row.last_backup_error,
    updated_at: row.updated_at,
  };
}

async function getConfig(serverId, includeSecret = false) {
  const r = await db.query(
    `SELECT c.*, s.name AS server_name
       FROM server_backup_configs c
       JOIN servers s ON s.id = c.server_id
      WHERE c.server_id = $1`,
    [serverId]
  );
  const row = r.rows[0] || null;
  if (includeSecret && row) row.password = decryptSecret(row.password_enc);
  return row;
}

async function upsertConfig(serverId, body) {
  const current = await getConfig(serverId, true);
  const host = String(body.host ?? current?.host ?? '').trim();
  const port = Math.max(1, Math.min(65535, Number(body.port ?? current?.port ?? 22) || 22));
  const username = String(body.username ?? current?.username ?? '').trim();
  const remotePath = normalizeRemotePath(body.remote_path ?? current?.remote_path);
  const enabled = body.enabled === true;
  const scheduleMinutes = Math.max(15, Math.min(1440, Number(body.schedule_minutes ?? current?.schedule_minutes ?? 60) || 60));

  let passwordEnc = current?.password_enc || null;
  if (body.password != null && String(body.password).length > 0) passwordEnc = encryptSecret(body.password);
  if (body.clear_password === true) passwordEnc = null;

  const r = await db.query(
    `INSERT INTO server_backup_configs
       (server_id, host, port, username, password_enc, remote_path, enabled, schedule_minutes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (server_id) DO UPDATE SET
       host = EXCLUDED.host,
       port = EXCLUDED.port,
       username = EXCLUDED.username,
       password_enc = EXCLUDED.password_enc,
       remote_path = EXCLUDED.remote_path,
       enabled = EXCLUDED.enabled,
       schedule_minutes = EXCLUDED.schedule_minutes,
       updated_at = NOW()
     RETURNING *`,
    [serverId, host, port, username, passwordEnc, remotePath, enabled, scheduleMinutes]
  );
  return publicConfig(r.rows[0]);
}

function assertConfig(config) {
  if (!config) throw new Error('backup config not found');
  if (!config.host) throw new Error('SFTP host is required');
  if (!config.username) throw new Error('SFTP username is required');
  if (!config.password) throw new Error('SFTP password is required');
  if (!config.remote_path) throw new Error('remote path is required');
}

async function connectSftp(config) {
  assertConfig(config);
  const sftp = new SftpClient();
  await sftp.connect({
    host: config.host,
    port: Number(config.port || 22),
    username: config.username,
    password: config.password,
    readyTimeout: 20_000,
    retries: 1,
    retry_factor: 1,
    retry_minTimeout: 1000,
  });
  return sftp;
}

async function testConnection(serverId) {
  const config = await getConfig(serverId, true);
  let sftp;
  try {
    sftp = await connectSftp(config);
    const remotePath = normalizeRemotePath(config.remote_path);
    const saveExists = await sftp.exists(remotePath + '/.save');
    const brasilzExists = await sftp.exists(remotePath + '/BrasilZ');
    if (!saveExists && !brasilzExists) {
      throw new Error(`remote folders not found under ${remotePath}: .save=${!!saveExists}, BrasilZ=${!!brasilzExists}`);
    }
    await db.query(
      `UPDATE server_backup_configs
          SET last_test_ok = true, last_test_at = NOW(), last_test_error = NULL, updated_at = NOW()
        WHERE server_id = $1`,
      [serverId]
    );
    return { ok: true, save_exists: !!saveExists, brasilz_exists: !!brasilzExists };
  } catch (err) {
    await db.query(
      `UPDATE server_backup_configs
          SET last_test_ok = false, last_test_at = NOW(), last_test_error = $2, updated_at = NOW()
        WHERE server_id = $1`,
      [serverId, err.message]
    );
    throw err;
  } finally {
    if (sftp) await sftp.end().catch(() => {});
  }
}

async function zipDirectory(sourceDir, outFile) {
  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve(archive.pointer()));
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function downloadIfExists(sftp, remote, local) {
  const exists = await sftp.exists(remote);
  if (!exists) return false;
  await fsp.mkdir(local, { recursive: true });
  await sftp.downloadDir(remote, local);
  return true;
}

async function runBackup(serverId, createdBy = 'scheduler') {
  const config = await getConfig(serverId, true);
  assertConfig(config);

  const started = Date.now();
  const serverDir = sanitizeSegment(serverId);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${serverDir}_${stamp}.zip`;
  const outDir = path.join(BACKUP_ROOT, serverDir);
  const outFile = path.join(outDir, filename);

  const insert = await db.query(
    `INSERT INTO server_backups (server_id, status, source_host, remote_path, filename, file_path, created_by)
     VALUES ($1, 'running', $2, $3, $4, $5, $6)
     RETURNING *`,
    [serverId, config.host, normalizeRemotePath(config.remote_path), filename, outFile, createdBy]
  );
  const backupId = insert.rows[0].id;

  let tmpDir;
  let sftp;
  try {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), `brasilz-backup-${serverDir}-`));
    sftp = await connectSftp(config);
    const remotePath = normalizeRemotePath(config.remote_path);
    const gotSave = await downloadIfExists(sftp, remotePath + '/.save', path.join(tmpDir, '.save'));
    const gotBrasilZ = await downloadIfExists(sftp, remotePath + '/BrasilZ', path.join(tmpDir, 'BrasilZ'));
    if (!gotSave && !gotBrasilZ) throw new Error(`nothing downloaded from ${remotePath} (.save/BrasilZ missing)`);

    const size = await zipDirectory(tmpDir, outFile);
    const durationMs = Date.now() - started;
    const r = await db.query(
      `UPDATE server_backups
          SET status = 'success', file_size = $2, finished_at = NOW(), duration_ms = $3
        WHERE id = $1
        RETURNING *`,
      [backupId, size, durationMs]
    );
    await db.query(
      `UPDATE server_backup_configs
          SET last_backup_at = NOW(), last_backup_status = 'success', last_backup_error = NULL, updated_at = NOW()
        WHERE server_id = $1`,
      [serverId]
    );
    logger.info(`server backup success server=${serverId} file=${outFile} size=${size}`);
    return r.rows[0];
  } catch (err) {
    const durationMs = Date.now() - started;
    await db.query(
      `UPDATE server_backups
          SET status = 'failed', error = $2, finished_at = NOW(), duration_ms = $3
        WHERE id = $1`,
      [backupId, err.message, durationMs]
    );
    await db.query(
      `UPDATE server_backup_configs
          SET last_backup_at = NOW(), last_backup_status = 'failed', last_backup_error = $2, updated_at = NOW()
        WHERE server_id = $1`,
      [serverId, err.message]
    );
    logger.error(`server backup failed server=${serverId}:`, err.message);
    throw err;
  } finally {
    if (sftp) await sftp.end().catch(() => {});
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function dueConfigs() {
  const r = await db.query(
    `SELECT c.server_id
       FROM server_backup_configs c
      WHERE c.enabled = true
        AND c.host <> ''
        AND c.username <> ''
        AND c.password_enc IS NOT NULL
        AND (
          c.last_backup_at IS NULL
          OR c.last_backup_at <= NOW() - (c.schedule_minutes || ' minutes')::INTERVAL
        )
      ORDER BY c.last_backup_at NULLS FIRST, c.server_id ASC`
  );
  return r.rows.map((x) => x.server_id);
}

async function schedulerTick() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const servers = await dueConfigs();
    for (const serverId of servers) {
      try {
        await runBackup(serverId, 'scheduler');
      } catch {
        // runBackup already logs + records DB failure
      }
    }
  } finally {
    schedulerBusy = false;
  }
}

function startBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  fsp.mkdir(BACKUP_ROOT, { recursive: true }).catch((err) => logger.warn('backup root mkdir failed:', err.message));
  setTimeout(schedulerTick, 30_000);
  setInterval(schedulerTick, TICK_MS);
  logger.info(`server backups: scheduler enabled root=${BACKUP_ROOT}`);
}

function backupRoot() {
  return BACKUP_ROOT;
}

module.exports = {
  backupRoot,
  publicConfig,
  getConfig,
  upsertConfig,
  testConnection,
  runBackup,
  startBackupScheduler,
};
