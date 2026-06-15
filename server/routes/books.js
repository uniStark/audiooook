const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {
  scanAudiobooks,
  getBookDetail,
  getCoverPath,
  updateBookMetadata,
  getBookMetadata,
  invalidateAudiobookIndexCache,
} = require('../services/scanner');
const {
  startBookConversion,
  getConversionProgress,
  bookNeedsConversion,
} = require('../services/converter');
const DEFAULT_COVER_PATH = path.join(__dirname, '..', 'assets', 'default-cover.svg');
const DEFAULT_ARTWORK_PATH = path.join(__dirname, '..', 'assets', 'default-artwork.png');

/**
 * GET /api/books
 * 获取所有有声书列表
 * 检测到 WMA/APE 文件时自动触发后台转换
 */
router.get('/', (req, res) => {
  try {
    const books = scanAudiobooks(req.userContext);

    for (const book of books) {
      if (bookNeedsConversion(book)) {
        startBookConversion(book, req.userContext.userId);
      }
    }

    const bookList = books.map(book => {
      const progress = getConversionProgress(book.id, req.userContext.userId);
      return {
        id: book.id,
        name: book.name,
        folderName: book.folderName,
        description: book.description,
        hasCover: book.hasCoverFile || !!book.cover,
        skipIntro: book.skipIntro,
        skipOutro: book.skipOutro,
        seasonCount: book.seasons.length,
        totalEpisodes: book.totalEpisodes,
        converting: progress ? {
          status: progress.status,
          total: progress.total,
          completed: progress.completed,
          failed: progress.failed || 0,
        } : null,
      };
    });
    res.json({ success: true, data: bookList });
  } catch (e) {
    console.error('Failed to scan audiobooks:', e);
    res.status(500).json({ success: false, error: '扫描有声书失败' });
  }
});

/**
 * GET /api/books/:bookId
 * 获取单本书详情
 */
router.get('/:bookId', (req, res) => {
  try {
    const book = getBookDetail(req.userContext, req.params.bookId);
    if (!book) {
      return res.status(404).json({ success: false, error: '书籍不存在' });
    }

    const safeBook = {
      ...book,
      path: undefined,
      seasons: book.seasons.map(s => ({
        ...s,
        path: undefined,
        episodes: s.episodes.map(e => ({
          ...e,
          filePath: undefined,
        })),
      })),
    };

    res.json({ success: true, data: safeBook });
  } catch (e) {
    console.error('Failed to get book detail:', e);
    res.status(500).json({ success: false, error: '获取书籍详情失败' });
  }
});

/**
 * GET /api/books/:bookId/conversion-status
 * 获取书籍的格式转换进度
 */
router.get('/:bookId/conversion-status', (req, res) => {
  const progress = getConversionProgress(req.params.bookId, req.userContext.userId);
  if (progress) {
    res.json({
      success: true,
      data: {
        status: progress.status,
        total: progress.total,
        completed: progress.completed,
        failed: progress.failed || 0,
        failedFiles: progress.failedFiles || [],
        currentFile: progress.currentFile || '',
      },
    });
  } else {
    res.json({ success: true, data: null });
  }
});

/**
 * GET /api/books/:bookId/cover
 */
router.get('/:bookId/cover', (req, res) => {
  try {
    const coverPath = getCoverPath(req.userContext, req.params.bookId);
    if (coverPath && fs.existsSync(coverPath)) {
      return res.sendFile(coverPath);
    }
    res.type('image/svg+xml');
    return res.sendFile(DEFAULT_COVER_PATH);
  } catch (e) {
    res.status(500).json({ success: false, error: '获取封面失败' });
  }
});

/**
 * GET /api/books/:bookId/artwork
 * Raster artwork for iOS lock screen / Media Session.
 */
router.get('/:bookId/artwork', (req, res) => {
  try {
    const coverPath = getCoverPath(req.userContext, req.params.bookId);
    if (coverPath && fs.existsSync(coverPath)) {
      return res.sendFile(coverPath);
    }
    res.type('image/png');
    return res.sendFile(DEFAULT_ARTWORK_PATH);
  } catch (e) {
    res.status(500).json({ success: false, error: '获取锁屏封面失败' });
  }
});

/**
 * PUT /api/books/:bookId/metadata
 */
router.put('/:bookId/metadata', (req, res) => {
  try {
    const { customName, description, skipIntro, skipOutro, customCover } = req.body;
    const updates = {};
    if (customName !== undefined) updates.customName = customName;
    if (description !== undefined) updates.description = description;
    if (skipIntro !== undefined) updates.skipIntro = Number(skipIntro) || 0;
    if (skipOutro !== undefined) updates.skipOutro = Number(skipOutro) || 0;
    if (customCover !== undefined) updates.customCover = customCover;

    const meta = updateBookMetadata(req.userContext, req.params.bookId, updates);
    invalidateAudiobookIndexCache(req.userContext);
    res.json({ success: true, data: meta });
  } catch (e) {
    console.error('Failed to update metadata:', e);
    res.status(500).json({ success: false, error: '更新元数据失败' });
  }
});

/**
 * POST /api/books/:bookId/cover
 */
router.post('/:bookId/cover', express.raw({ type: 'image/*', limit: '5mb' }), (req, res) => {
  try {
    const contentType = req.headers['content-type'] || 'image/jpeg';
    const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : (contentType.split('/')[1] || 'jpg');
    const coversDir = req.userContext.coversDir;
    if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });
    const coverFile = path.join(coversDir, `${req.params.bookId}.${ext}`);

    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
    for (const oldExt of imageExts) {
      const oldFile = path.join(coversDir, `${req.params.bookId}.${oldExt}`);
      if (oldFile !== coverFile && fs.existsSync(oldFile)) {
        try { fs.unlinkSync(oldFile); } catch { /* ignore */ }
      }
    }

    fs.writeFileSync(coverFile, req.body);
    updateBookMetadata(req.userContext, req.params.bookId, { customCover: coverFile });
    invalidateAudiobookIndexCache(req.userContext);

    res.json({ success: true, message: '封面上传成功' });
  } catch (e) {
    console.error('Failed to upload cover:', e);
    res.status(500).json({ success: false, error: '上传封面失败' });
  }
});

module.exports = router;
