const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { SERVER_DATA_DIR, PROJECT_ROOT, IS_PRODUCTION, METADATA_FILE, USER_DATA_FILE } = require('../utils/paths');

const SESSION_COOKIE_NAME = 'audiooook_user_session';
const SESSION_MAX_AGE_DAYS = 30;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_USER = 'admin';
const DEFAULT_PASSWORD = 'admin';

function now() {
  return Date.now();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeUsername(username) {
  return String(username || '').trim();
}

function safeUsername(username) {
  const safe = normalizeUsername(username)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return safe || `user-${crypto.randomBytes(4).toString('hex')}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, 210_000, 32, 'sha256').toString('base64url');
  return { salt, hash };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('base64url');
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function defaultDbPath() {
  return process.env.AUDIOOOOK_DB_PATH || path.join(SERVER_DATA_DIR, 'audiooook.sqlite');
}

function defaultAudiobookPathFor(username) {
  if (username === DEFAULT_USER) {
    return process.env.DEFAULT_USER_AUDIOBOOK_PATH
      || process.env.AUDIOBOOK_PATH
      || (IS_PRODUCTION ? '/data/audiooook_web' : path.join(PROJECT_ROOT, 'audiobooks'));
  }
  return path.join(SERVER_DATA_DIR, 'users', safeUsername(username), 'audiobooks');
}

class AppDb {
  constructor({ dbPath = defaultDbPath(), seedDefaultUser = true } = {}) {
    ensureDir(path.dirname(dbPath));
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.initSchema();
    if (seedDefaultUser) this.seedDefaultUser();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        avatar_path TEXT,
        audiobook_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER NOT NULL,
        book_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, book_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS progress (
        user_id INTEGER NOT NULL,
        book_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, book_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS metadata (
        user_id INTEGER NOT NULL,
        book_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, book_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  seedDefaultUser() {
    const existing = this.getUserByUsername(DEFAULT_USER);
    const user = existing || this.createUser(DEFAULT_USER, DEFAULT_PASSWORD, {
      audiobookPath: defaultAudiobookPathFor(DEFAULT_USER),
    });
    this.migrateLegacyData(user);
  }

  migrateLegacyData(user) {
    const markerKey = 'legacyJsonMigratedAt';
    if (this.getSettings(user.id)[markerKey]) return;

    try {
      if (fs.existsSync(METADATA_FILE)) {
        const metadata = parseJson(fs.readFileSync(METADATA_FILE, 'utf-8'), {});
        for (const [bookId, data] of Object.entries(metadata || {})) {
          this.updateMetadata(user.id, bookId, data);
        }
      }
      if (fs.existsSync(USER_DATA_FILE)) {
        const userData = parseJson(fs.readFileSync(USER_DATA_FILE, 'utf-8'), {});
        for (const [bookId, data] of Object.entries(userData.favorites || {})) {
          this.putFavorite(user.id, bookId, data);
        }
        for (const [bookId, data] of Object.entries(userData.progress || {})) {
          this.putProgress(user.id, bookId, data);
        }
        if (userData.settings) this.updateSettings(user.id, userData.settings);
      }
      this.updateSettings(user.id, { [markerKey]: now() });
    } catch (e) {
      console.warn('[DB] Legacy JSON migration skipped:', e.message);
    }
  }

  rowToUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      avatarPath: row.avatar_path || null,
      audiobookPath: row.audiobook_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  createUser(username, password, { audiobookPath } = {}) {
    const normalized = normalizeUsername(username);
    if (!/^[\p{L}\p{N}_-]{2,32}$/u.test(normalized)) {
      const error = new Error('用户名需为 2-32 位，可包含中文、字母、数字、下划线或短横线');
      error.statusCode = 400;
      throw error;
    }
    if (!String(password || '').trim()) {
      const error = new Error('密码不能为空');
      error.statusCode = 400;
      throw error;
    }

    const ts = now();
    const { salt, hash } = hashPassword(password);
    const resolvedAudiobookPath = audiobookPath || defaultAudiobookPathFor(normalized);
    ensureDir(resolvedAudiobookPath);

    try {
      const result = this.db.prepare(`
        INSERT INTO users (username, password_hash, password_salt, audiobook_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(normalized, hash, salt, resolvedAudiobookPath, ts, ts);
      return this.getUserById(Number(result.lastInsertRowid));
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) {
        const error = new Error('用户名已存在');
        error.statusCode = 409;
        throw error;
      }
      throw e;
    }
  }

  getUserById(userId) {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return this.rowToUser(row);
  }

  getUserByUsername(username) {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(normalizeUsername(username));
    return this.rowToUser(row);
  }

  listUsers() {
    return this.db.prepare('SELECT * FROM users ORDER BY created_at ASC').all().map((row) => this.rowToUser(row));
  }

  authenticateUser(username, password) {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(normalizeUsername(username));
    if (!row) return null;
    const { hash } = hashPassword(password, row.password_salt);
    if (!safeEqual(hash, row.password_hash)) return null;
    return this.rowToUser(row);
  }

  updateUserAvatar(userId, avatarPath) {
    const ts = now();
    this.db.prepare('UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?').run(avatarPath, ts, userId);
    return this.getUserById(userId);
  }

  createSession(userId, ttlMs = SESSION_MAX_AGE_MS) {
    const token = crypto.randomBytes(32).toString('base64url');
    const ts = now();
    const expiresAt = ts + ttlMs;
    this.db.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(hashToken(token), userId, expiresAt, ts);
    return { token, expiresAt };
  }

  getSession(token) {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const row = this.db.prepare(`
      SELECT sessions.*, users.username, users.avatar_path, users.audiobook_path, users.created_at AS user_created_at, users.updated_at AS user_updated_at
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
    `).get(tokenHash);
    if (!row) return null;
    if (row.expires_at <= now()) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    return {
      tokenHash,
      expiresAt: row.expires_at,
      user: {
        id: row.user_id,
        username: row.username,
        avatarPath: row.avatar_path || null,
        audiobookPath: row.audiobook_path,
        createdAt: row.user_created_at,
        updatedAt: row.user_updated_at,
      },
    };
  }

  deleteSession(token) {
    if (!token) return;
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }

  deleteExpiredSessions() {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
  }

  getSettings(userId) {
    const rows = this.db.prepare('SELECT key, value_json FROM settings WHERE user_id = ?').all(userId);
    return rows.reduce((settings, row) => {
      settings[row.key] = parseJson(row.value_json, null);
      return settings;
    }, {});
  }

  updateSettings(userId, settings) {
    const ts = now();
    const entries = Object.entries(settings || {});
    const stmt = this.db.prepare(`
      INSERT INTO settings (user_id, key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `);
    this.db.exec('BEGIN');
    try {
      for (const [key, value] of entries) {
        stmt.run(userId, key, JSON.stringify(value), ts);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return this.getSettings(userId);
  }

  listFavorites(userId) {
    return this.db.prepare('SELECT data_json FROM favorites WHERE user_id = ? ORDER BY added_at DESC')
      .all(userId)
      .map((row) => parseJson(row.data_json, {}));
  }

  putFavorite(userId, bookId, data) {
    const item = { ...(data || {}), bookId, addedAt: data?.addedAt || now() };
    this.db.prepare(`
      INSERT INTO favorites (user_id, book_id, data_json, added_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET data_json = excluded.data_json, added_at = excluded.added_at
    `).run(userId, bookId, JSON.stringify(item), item.addedAt);
    return item;
  }

  deleteFavorite(userId, bookId) {
    this.db.prepare('DELETE FROM favorites WHERE user_id = ? AND book_id = ?').run(userId, bookId);
  }

  listProgress(userId) {
    return this.db.prepare('SELECT data_json FROM progress WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId)
      .map((row) => parseJson(row.data_json, {}));
  }

  putProgress(userId, bookId, data) {
    const item = { ...(data || {}), bookId, updatedAt: data?.updatedAt || now() };
    this.db.prepare(`
      INSERT INTO progress (user_id, book_id, data_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
    `).run(userId, bookId, JSON.stringify(item), item.updatedAt);
    return item;
  }

  listMetadata(userId) {
    return this.db.prepare('SELECT book_id, data_json FROM metadata WHERE user_id = ?')
      .all(userId)
      .reduce((metadata, row) => {
        metadata[row.book_id] = parseJson(row.data_json, {});
        return metadata;
      }, {});
  }

  getMetadata(userId, bookId) {
    const row = this.db.prepare('SELECT data_json FROM metadata WHERE user_id = ? AND book_id = ?').get(userId, bookId);
    return parseJson(row?.data_json, {});
  }

  updateMetadata(userId, bookId, updates) {
    const current = this.getMetadata(userId, bookId);
    const next = { ...current, ...(updates || {}) };
    this.db.prepare(`
      INSERT INTO metadata (user_id, book_id, data_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
    `).run(userId, bookId, JSON.stringify(next), now());
    return next;
  }
}

let appDb = null;

function createAppDb(options) {
  return new AppDb(options);
}

function getAppDb() {
  if (!appDb) appDb = createAppDb();
  return appDb;
}

module.exports = {
  AppDb,
  DEFAULT_PASSWORD,
  DEFAULT_USER,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_DAYS,
  SESSION_MAX_AGE_MS,
  createAppDb,
  defaultAudiobookPathFor,
  getAppDb,
  safeUsername,
};
