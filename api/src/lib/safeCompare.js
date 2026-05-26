'use strict';

const crypto = require('node:crypto');

/**
 * Constant-time string comparison. Returns false on length mismatch or empty inputs.
 * Used to validate the X-BrasilZ-Api-Key header against the configured secret.
 */
function safeEqual(a, b) {
  if (!a || !b) return false;
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

module.exports = { safeEqual };
