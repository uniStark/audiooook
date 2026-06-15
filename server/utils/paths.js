/**
 * 统一路径管理
 *
 * Dev 环境：config.json / metadata.json / user-data.json 放在项目根目录，方便编辑
 * Production 环境：放在 server/data/ 下，通过 Docker volume 持久化
 * 封面等数据始终放在 server/data/
 */

const path = require('path');
const fs = require('fs');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SERVER_DATA_DIR = path.join(__dirname, '..', 'data');

const CONFIG_FILE = IS_PRODUCTION
  ? path.join(SERVER_DATA_DIR, 'config.json')
  : path.join(PROJECT_ROOT, 'config.json');

const METADATA_FILE = IS_PRODUCTION
  ? path.join(SERVER_DATA_DIR, 'metadata.json')
  : path.join(PROJECT_ROOT, 'metadata.json');

const COVERS_DIR = path.join(SERVER_DATA_DIR, 'covers');
const USERS_DIR = path.join(SERVER_DATA_DIR, 'users');

const USER_DATA_FILE = IS_PRODUCTION
  ? path.join(SERVER_DATA_DIR, 'user-data.json')
  : path.join(PROJECT_ROOT, 'user-data.json');

function ensureDirs() {
  for (const dir of [SERVER_DATA_DIR, COVERS_DIR, USERS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

ensureDirs();

function safePathSegment(value) {
  return String(value || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'user';
}

function getUserDataDir(username) {
  const dir = path.join(USERS_DIR, safePathSegment(username));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUserCoversDir(username) {
  const dir = path.join(getUserDataDir(username), 'covers');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUserAvatarDir(username) {
  const dir = path.join(getUserDataDir(username), 'profile');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  IS_PRODUCTION,
  PROJECT_ROOT,
  SERVER_DATA_DIR,
  CONFIG_FILE,
  METADATA_FILE,
  COVERS_DIR,
  USERS_DIR,
  USER_DATA_FILE,
  getUserAvatarDir,
  getUserCoversDir,
  getUserDataDir,
  safePathSegment,
};
