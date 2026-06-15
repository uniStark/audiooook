const { getAppDb, SESSION_COOKIE_NAME } = require('../db/appDb');
const { parseCookies } = require('../utils/accessAuth');
const { getUserCoversDir, getUserDataDir } = require('../utils/paths');

function buildUserContext(user) {
  return {
    userId: user.id,
    username: user.username,
    audiobookPath: user.audiobookPath,
    coversDir: getUserCoversDir(user.username),
    userDir: getUserDataDir(user.username),
  };
}

function userContextMiddleware(req, res, next) {
  if (req.path.startsWith('/api/session')) return next();
  if (!req.path.startsWith('/api/')) return next();

  const cookies = parseCookies(req.headers.cookie || '');
  const session = getAppDb().getSession(cookies[SESSION_COOKIE_NAME]);

  if (!session) {
    return res.status(401).json({
      success: false,
      userRequired: true,
      error: '请选择或登录用户',
    });
  }

  req.user = session.user;
  req.userContext = buildUserContext(session.user);
  next();
}

module.exports = {
  buildUserContext,
  userContextMiddleware,
};
