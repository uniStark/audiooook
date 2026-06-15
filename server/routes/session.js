const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { getAppDb, SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } = require('../db/appDb');
const { parseCookies } = require('../utils/accessAuth');
const { getCookieOptions } = require('../utils/accessAuth');
const { getUserAvatarDir } = require('../utils/paths');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
});

function userPayload(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarPath ? `/api/session/avatar/${encodeURIComponent(user.username)}?v=${user.updatedAt || Date.now()}` : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function getCurrentSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return getAppDb().getSession(cookies[SESSION_COOKIE_NAME]);
}

function setSessionCookie(req, res, userId) {
  const session = getAppDb().createSession(userId, SESSION_MAX_AGE_MS);
  res.cookie(SESSION_COOKIE_NAME, session.token, getCookieOptions(req));
  return session;
}

function clearSessionCookie(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  getAppDb().deleteSession(cookies[SESSION_COOKIE_NAME]);
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

function sendSession(req, res, currentUser = null) {
  const session = currentUser ? null : getCurrentSession(req);
  const users = getAppDb().listUsers().map(userPayload);
  res.json({
    success: true,
    currentUser: userPayload(currentUser || session?.user),
    users,
  });
}

router.get('/', (req, res) => {
  sendSession(req, res);
});

router.post('/login', (req, res) => {
  const user = getAppDb().authenticateUser(req.body?.username, req.body?.password);
  if (!user) {
    return res.status(401).json({ success: false, error: '用户名或密码不正确' });
  }
  setSessionCookie(req, res, user.id);
  sendSession(req, res, user);
});

router.post('/switch', (req, res) => {
  const user = getAppDb().authenticateUser(req.body?.username, req.body?.password);
  if (!user) {
    return res.status(401).json({ success: false, error: '用户名或密码不正确' });
  }
  clearSessionCookie(req, res);
  setSessionCookie(req, res, user.id);
  sendSession(req, res, user);
});

router.post('/create', (req, res) => {
  try {
    const user = getAppDb().createUser(req.body?.username, req.body?.password);
    setSessionCookie(req, res, user.id);
    sendSession(req, res, user);
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, error: e.message || '创建用户失败' });
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ success: true });
});

router.get('/avatar/:username', (req, res) => {
  const user = getAppDb().getUserByUsername(req.params.username);
  if (!user?.avatarPath || !fs.existsSync(user.avatarPath)) {
    return res.status(404).json({ success: false, error: '头像不存在' });
  }
  res.sendFile(user.avatarPath);
});

router.post('/avatar', upload.single('avatar'), (req, res) => {
  const session = getCurrentSession(req);
  if (!session) {
    return res.status(401).json({ success: false, userRequired: true, error: '请选择或登录用户' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, error: '请选择头像图片' });
  }

  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ext = mimeToExt[req.file.mimetype];
  if (!ext) {
    return res.status(400).json({ success: false, error: '头像仅支持 JPG、PNG、WebP 或 GIF' });
  }

  const avatarDir = getUserAvatarDir(session.user.username);
  for (const oldExt of Object.values(mimeToExt)) {
    const oldPath = path.join(avatarDir, `avatar.${oldExt}`);
    if (fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
    }
  }

  const avatarPath = path.join(avatarDir, `avatar.${ext}`);
  fs.writeFileSync(avatarPath, req.file.buffer);
  const user = getAppDb().updateUserAvatar(session.user.id, avatarPath);
  res.json({ success: true, data: userPayload(user) });
});

module.exports = router;
