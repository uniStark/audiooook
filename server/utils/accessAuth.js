const crypto = require('crypto');

const DEFAULT_ACCESS_PASSWORD = 'audiooook';
const ACCESS_COOKIE_NAME = 'audiooook_access';
const ACCESS_MAX_AGE_DAYS = 30;
const ACCESS_MAX_AGE_MS = ACCESS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function getAccessPassword() {
  return process.env.PUBLIC_ACCESS_PASSWORD || DEFAULT_ACCESS_PASSWORD;
}

function getSigningSecret() {
  return process.env.PUBLIC_ACCESS_SECRET || getAccessPassword();
}

function getCookieOptions(req) {
  const forwardedProto = req.get?.('x-forwarded-proto') || '';
  const host = req.get?.('host') || '';
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const isSecure = Boolean(req.secure || forwardedProto.split(',')[0] === 'https' || (host && !isLocalHost));

  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    maxAge: ACCESS_MAX_AGE_MS,
    path: '/',
  };
}

function signValue(value, secret = getSigningSecret()) {
  return crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64url');
}

function createAccessToken(now = Date.now(), secret = getSigningSecret()) {
  const issuedAt = String(now);
  return `${issuedAt}.${signValue(issuedAt, secret)}`;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidAccessToken(token, now = Date.now(), secret = getSigningSecret()) {
  if (!token || typeof token !== 'string') return false;

  const [issuedAt, signature, ...extra] = token.split('.');
  if (!issuedAt || !signature || extra.length > 0) return false;

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) return false;
  if (issuedAtMs > now + 60_000) return false;
  if (now - issuedAtMs > ACCESS_MAX_AGE_MS) return false;

  return safeEqual(signValue(issuedAt, secret), signature);
}

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) return cookies;
      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function verifyPassword(input, password = getAccessPassword()) {
  return safeEqual(input || '', password);
}

module.exports = {
  ACCESS_COOKIE_NAME,
  ACCESS_MAX_AGE_DAYS,
  ACCESS_MAX_AGE_MS,
  DEFAULT_ACCESS_PASSWORD,
  createAccessToken,
  getAccessPassword,
  getCookieOptions,
  isValidAccessToken,
  parseCookies,
  verifyPassword,
};
