const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getBookDetail } = require('../services/scanner');
const { getExtension } = require('../utils/parser');

function findEpisode(context, bookId, seasonId, episodeId) {
  const book = getBookDetail(context, bookId);
  if (!book) return { error: '书籍不存在' };

  const season = book.seasons.find(s => s.id === seasonId);
  if (!season) return { error: '季不存在' };

  const episode = season.episodes.find(e => e.id === episodeId);
  if (!episode) return { error: '集不存在' };

  if (!fs.existsSync(episode.filePath)) return { error: '音频文件不存在' };

  return { book, season, episode };
}

/**
 * GET /api/audio/:bookId/:seasonId/:episodeId
 * 流式传输音频文件，支持 Range 请求
 */
router.get('/:bookId/:seasonId/:episodeId', (req, res) => {
  try {
    const { bookId, seasonId, episodeId } = req.params;
    const result = findEpisode(req.userContext, bookId, seasonId, episodeId);
    if (result.error) {
      return res.status(404).json({ success: false, error: result.error });
    }
    streamFile(result.episode.filePath, req, res);
  } catch (e) {
    console.error('Audio streaming error:', e);
    res.status(500).json({ success: false, error: '音频流错误' });
  }
});

/**
 * GET /api/audio/download/:bookId/:seasonId/:episodeId
 * 下载音频文件
 */
router.get('/download/:bookId/:seasonId/:episodeId', (req, res) => {
  try {
    const { bookId, seasonId, episodeId } = req.params;
    const result = findEpisode(req.userContext, bookId, seasonId, episodeId);
    if (result.error) {
      return res.status(404).json({ success: false, error: result.error });
    }

    const { episode } = result;
    const stat = fs.statSync(episode.filePath);
    const mimeType = getMimeType(getExtension(episode.filePath));

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(episode.fileName)}"`);

    fs.createReadStream(episode.filePath).pipe(res);
  } catch (e) {
    console.error('Audio download error:', e);
    res.status(500).json({ success: false, error: '下载失败' });
  }
});

function streamFile(filePath, req, res) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mimeType = getMimeType(getExtension(filePath));
  const range = req.headers.range;

  if (range) {
    const parsedRange = parseRangeHeader(range, fileSize);
    if (!parsedRange) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': 0,
      });
      res.end();
      return;
    }

    const { start, end } = parsedRange;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

function parseRangeHeader(range, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || fileSize <= 0) return null;

  const [, startText, endText] = match;
  if (startText === '' && endText === '') return null;

  if (startText === '') {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;

    const start = Math.max(fileSize - suffixLength, 0);
    return { start, end: fileSize - 1 };
  }

  const start = Number(startText);
  const end = endText === '' ? fileSize - 1 : Number(endText);

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start >= fileSize || end < start) return null;

  return { start, end: Math.min(end, fileSize - 1) };
}

function getMimeType(ext) {
  const mimeTypes = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.wma': 'audio/x-ms-wma',
    '.opus': 'audio/opus',
    '.ape': 'audio/ape',
  };
  return mimeTypes[ext] || 'audio/mpeg';
}

module.exports = router;
