const express = require('express');
const { getAppDb } = require('../db/appDb');

const router = express.Router();

router.get('/favorites', (req, res) => {
  const list = getAppDb().listFavorites(req.user.id);
  res.json({ success: true, data: list });
});

router.put('/favorites/:bookId', (req, res) => {
  getAppDb().putFavorite(req.user.id, req.params.bookId, req.body);
  res.json({ success: true });
});

router.delete('/favorites/:bookId', (req, res) => {
  getAppDb().deleteFavorite(req.user.id, req.params.bookId);
  res.json({ success: true });
});

router.get('/progress', (req, res) => {
  const list = getAppDb().listProgress(req.user.id);
  res.json({ success: true, data: list });
});

router.put('/progress/:bookId', (req, res) => {
  getAppDb().putProgress(req.user.id, req.params.bookId, req.body);
  res.json({ success: true });
});

router.get('/settings', (req, res) => {
  const settings = getAppDb().getSettings(req.user.id);
  res.json({ success: true, data: settings });
});

router.put('/settings', (req, res) => {
  const settings = getAppDb().updateSettings(req.user.id, req.body || {});
  res.json({ success: true, data: settings });
});

module.exports = router;
