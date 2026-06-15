const express = require('express');
const {
  ACCESS_COOKIE_NAME,
  ACCESS_MAX_AGE_DAYS,
  createAccessToken,
  getAccessPassword,
  getCookieOptions,
  isValidAccessToken,
  parseCookies,
  verifyPassword,
} = require('../utils/accessAuth');

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return isValidAccessToken(cookies[ACCESS_COOKIE_NAME]);
}

function getLoginPage({ error = '' } = {}) {
  const errorHtml = error
    ? `<div class="error" role="alert">${escapeHtml(error)}</div>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Audiooook 访问验证</title>
  <style>
    :root {
      color-scheme: light dark;
      --accent: #d97706;
      --text: #0f172a;
      --muted: #64748b;
      --surface: rgba(255, 255, 255, 0.82);
      --border: rgba(15, 23, 42, 0.1);
      --shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --text: #f8fafc;
        --muted: #94a3b8;
        --surface: rgba(15, 23, 42, 0.78);
        --border: rgba(148, 163, 184, 0.18);
        --shadow: 0 24px 80px rgba(0, 0, 0, 0.36);
      }
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100dvh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: max(env(safe-area-inset-top), 24px) 18px max(env(safe-area-inset-bottom), 24px);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Noto Sans SC", sans-serif;
      background:
        radial-gradient(circle at 22% 8%, rgba(245, 158, 11, 0.18), transparent 18rem),
        radial-gradient(circle at 86% 18%, rgba(96, 165, 250, 0.14), transparent 20rem),
        linear-gradient(180deg, #fafaf9 0%, #e2e8f0 100%);
    }
    @media (prefers-color-scheme: dark) {
      body {
        background:
          radial-gradient(circle at 50% -10%, rgba(245, 158, 11, 0.18), transparent 26rem),
          linear-gradient(180deg, #0b1220 0%, #030712 100%);
      }
    }
    .card {
      width: min(100%, 390px);
      padding: 28px;
      border: 1px solid var(--border);
      border-radius: 32px;
      background: var(--surface);
      box-shadow: var(--shadow);
      backdrop-filter: blur(24px);
    }
    .mark {
      width: 56px;
      height: 56px;
      display: grid;
      place-items: center;
      border-radius: 20px;
      margin-bottom: 22px;
      color: white;
      background: linear-gradient(135deg, #f59e0b, #b45309);
      box-shadow: 0 16px 36px rgba(217, 119, 6, 0.28);
      font-size: 28px;
      font-weight: 700;
    }
    h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.15;
      letter-spacing: -0.04em;
    }
    p {
      margin: 10px 0 24px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.7;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
    }
    input {
      width: 100%;
      min-height: 52px;
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 0 16px;
      color: var(--text);
      background: rgba(255, 255, 255, 0.58);
      font: inherit;
      font-size: 16px;
      outline: none;
    }
    @media (prefers-color-scheme: dark) {
      input { background: rgba(30, 41, 59, 0.68); }
    }
    input:focus {
      border-color: rgba(217, 119, 6, 0.56);
      box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.12);
    }
    button {
      width: 100%;
      min-height: 52px;
      margin-top: 14px;
      border: 0;
      border-radius: 18px;
      color: #fff7ed;
      background: var(--accent);
      box-shadow: 0 16px 36px rgba(217, 119, 6, 0.24);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    button:active { transform: scale(0.99); }
    .error {
      margin-bottom: 14px;
      border-radius: 16px;
      padding: 10px 12px;
      color: #991b1b;
      background: rgba(239, 68, 68, 0.12);
      font-size: 13px;
    }
    .hint {
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="mark">A</div>
    <h1>访问 Audiooook</h1>
    <p>这是公网访问保护。通过验证后，此浏览器会记住 30 天，多设备可分别登录。</p>
    ${errorHtml}
    <form method="post" action="/api/auth/login">
      <label for="password">访问密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
      <button type="submit">进入书库</button>
    </form>
    <p class="hint">Created by Adrian Stark</p>
  </main>
</body>
</html>`;
}

function publicAccessMiddleware(req, res, next) {
  if (req.path.startsWith('/api/auth/')) {
    return next();
  }

  if (isAuthenticated(req)) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, authRequired: true, error: '需要访问密码' });
  }

  return res.status(401).set('Cache-Control', 'no-store').send(getLoginPage());
}

function createAuthRouter() {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json({
      success: true,
      authenticated: isAuthenticated(req),
      maxAgeDays: ACCESS_MAX_AGE_DAYS,
    });
  });

  router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
    const password = req.body?.password;
    const wantsJson = req.is('application/json') || req.get('accept')?.includes('application/json');

    if (!verifyPassword(password, getAccessPassword())) {
      if (wantsJson) {
        return res.status(401).json({ success: false, error: '访问密码不正确' });
      }
      return res.status(401).set('Cache-Control', 'no-store').send(getLoginPage({ error: '访问密码不正确，请重试。' }));
    }

    res.cookie(ACCESS_COOKIE_NAME, createAccessToken(), getCookieOptions(req));

    if (wantsJson) {
      return res.json({ success: true });
    }
    return res.redirect('/');
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(ACCESS_COOKIE_NAME, { path: '/' });
    res.json({ success: true });
  });

  return router;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

module.exports = {
  createAuthRouter,
  getLoginPage,
  isAuthenticated,
  publicAccessMiddleware,
};
