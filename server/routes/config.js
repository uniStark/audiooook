const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { isOSSConfigured } = require('../services/oss');
const { CONFIG_FILE } = require('../utils/paths');
const { getAppDb } = require('../db/appDb');

const router = express.Router();

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return { cacheSizeMB: 300, ossEnabled: isOSSConfigured() };
}

function saveConfig(config) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

router.get('/', (req, res) => {
  const config = loadConfig();
  const userSettings = getAppDb().getSettings(req.user.id);
  res.json({
    success: true,
    data: {
      ...config,
      cacheSizeMB: userSettings.cacheLimitMB || config.cacheSizeMB || 300,
      audiobookPath: req.userContext.audiobookPath,
      ossEnabled: isOSSConfigured(),
      pathLocked: true,
    },
  });
});

router.put('/', (req, res) => {
  try {
    if (req.body?.audiobookPath !== undefined) {
      return res.status(403).json({
        success: false,
        error: '多用户模式下不支持在设置中切换服务器书库路径',
      });
    }

    if (req.body?.cacheSizeMB !== undefined) {
      const cacheSizeMB = Math.max(50, Math.min(5000, Number(req.body.cacheSizeMB) || 300));
      getAppDb().updateSettings(req.user.id, { cacheLimitMB: cacheSizeMB });
      const config = loadConfig();
      saveConfig({ ...config, cacheSizeMB });
    }

    const config = loadConfig();
    const userSettings = getAppDb().getSettings(req.user.id);
    res.json({
      success: true,
      data: {
        ...config,
        cacheSizeMB: userSettings.cacheLimitMB || config.cacheSizeMB || 300,
        audiobookPath: req.userContext.audiobookPath,
        ossEnabled: isOSSConfigured(),
        pathLocked: true,
      },
    });
  } catch (e) {
    console.error('Failed to update config:', e);
    res.status(500).json({ success: false, error: '更新配置失败' });
  }
});

router.get('/browse', (req, res) => {
  res.status(403).json({
    success: false,
    error: '多用户模式下不开放服务器目录浏览',
  });
});

module.exports = router;
