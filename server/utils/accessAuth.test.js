const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACCESS_COOKIE_NAME,
  ACCESS_MAX_AGE_MS,
  createAccessToken,
  getCookieOptions,
  isValidAccessToken,
  parseCookies,
  verifyPassword,
} = require('./accessAuth');

test('creates access tokens that remain valid for 30 days', () => {
  const now = 1_700_000_000_000;
  const token = createAccessToken(now, 'secret');

  assert.equal(isValidAccessToken(token, now + ACCESS_MAX_AGE_MS - 1, 'secret'), true);
  assert.equal(isValidAccessToken(token, now + ACCESS_MAX_AGE_MS + 1, 'secret'), false);
});

test('rejects tampered access tokens', () => {
  const token = createAccessToken(1_700_000_000_000, 'secret');

  assert.equal(isValidAccessToken(token.replace(/\.[^.]+$/, '.bad'), 1_700_000_000_000, 'secret'), false);
});

test('verifies the default public access password', () => {
  assert.equal(verifyPassword('audiooook', 'audiooook'), true);
  assert.equal(verifyPassword('wrong-password', 'audiooook'), false);
});

test('parses the access cookie value', () => {
  const cookies = parseCookies(`${ACCESS_COOKIE_NAME}=abc.def; theme=dark`);

  assert.equal(cookies[ACCESS_COOKIE_NAME], 'abc.def');
  assert.equal(cookies.theme, 'dark');
});

test('marks cookies secure when request is behind HTTPS proxy', () => {
  const options = getCookieOptions({
    secure: false,
    get: (name) => (name === 'x-forwarded-proto' ? 'https' : ''),
  });

  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.secure, true);
  assert.equal(options.maxAge, ACCESS_MAX_AGE_MS);
});

test('marks cookies secure for public hosts even when proxy omits protocol', () => {
  const options = getCookieOptions({
    secure: false,
    get: (name) => (name === 'host' ? 'audiooook.example.com' : ''),
  });

  assert.equal(options.secure, true);
});

test('keeps local development cookies usable over plain http', () => {
  const options = getCookieOptions({
    secure: false,
    get: (name) => (name === 'host' ? '127.0.0.1:3003' : ''),
  });

  assert.equal(options.secure, false);
});
