const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { needsConversion, convertFile } = require('../services/converter');
const { invalidateAudiobookIndexCache } = require('../services/scanner');
const { isAudioFile } = require('../utils/parser');

const ARCHIVE_EXTS = new Set(['.zip', '.7z', '.rar']);

class UploadValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadValidationError';
    this.statusCode = 400;
  }
}

// ========== Startup: clean stale temp files from previous runs ==========
function cleanupStaleTempDirs(audiobookPath = null) {
  // Clean old /tmp/audiooook_uploads (legacy location)
  const legacyTmp = path.join(require('os').tmpdir(), 'audiooook_uploads');
  try {
    if (fs.existsSync(legacyTmp)) {
      fs.rmSync(legacyTmp, { recursive: true, force: true });
      console.log(`[Upload] 已清理旧临时目录: ${legacyTmp}`);
    }
  } catch { /* ignore */ }

  // Clean .upload_tmp inside the audiobook path
  try {
    const abPath = audiobookPath;
    if (!abPath) return;
    const tmpBase = path.join(abPath, '.upload_tmp');
    if (fs.existsSync(tmpBase)) {
      fs.rmSync(tmpBase, { recursive: true, force: true });
      console.log(`[Upload] 已清理上传临时目录: ${tmpBase}`);
    }
  } catch { /* ignore */ }
}

// ========== Disk space helpers ==========
function parseDfAvailableBytes(output) {
  const lines = String(output || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return -1;
  const parts = lines[lines.length - 1].trim().split(/\s+/);
  const availableKb = Number(parts[3]);
  if (!Number.isFinite(availableKb) || availableKb < 0) return -1;
  return availableKb * 1024;
}

function getAvailableBytes(dirPath, deps = {}) {
  const statfsSync = deps.statfsSync || fs.statfsSync;
  const runExecFileSync = deps.execFileSync || execFileSync;

  try {
    if (typeof statfsSync === 'function') {
      const stat = statfsSync(dirPath);
      const bsize = Number(stat.bsize);
      const bavail = Number(stat.bavail);
      if (Number.isFinite(bsize) && Number.isFinite(bavail) && bsize >= 0 && bavail >= 0) {
        return bsize * bavail;
      }
    }
  } catch { /* fall back to df */ }

  try {
    const output = runExecFileSync('df', ['-kP', dirPath], { encoding: 'utf8' });
    return parseDfAvailableBytes(output);
  } catch {
    return -1;
  }
}

function formatBytes(bytes) {
  if (bytes < 0) return '未知';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function isArchiveFile(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tar.bz2') || lower.endsWith('.tar.xz') || lower.endsWith('.tgz')) return true;
  return ARCHIVE_EXTS.has(path.extname(lower));
}

function makeTempFilename(index, originalName) {
  const posixBase = path.posix.basename(String(originalName || ''));
  const base = path.win32.basename(posixBase);
  const lower = base.toLowerCase();
  const doubleExt = ['.tar.gz', '.tar.bz2', '.tar.xz'].find(ext => lower.endsWith(ext));
  const ext = doubleExt || path.extname(base);
  return `${index}${ext}`;
}

// Temp dir lives INSIDE the audiobook volume → same filesystem → rename works, no double space
const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (!req._tempDir) {
      const base = path.join(req.userContext.audiobookPath, '.upload_tmp');
      req._tempDir = path.join(base, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      fs.mkdirSync(req._tempDir, { recursive: true });
    }
    cb(null, req._tempDir);
  },
  filename(req, file, cb) {
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    if (req._fileIdx === undefined) req._fileIdx = 0;
    cb(null, makeTempFilename(req._fileIdx++, name));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

// ========== Archive extraction ==========

function assertSafePathPart(part) {
  if (typeof part !== 'string' || part.length === 0) {
    throw new UploadValidationError('上传路径无效');
  }
  if (part.includes('\0') || path.isAbsolute(part) || path.win32.isAbsolute(part)) {
    throw new UploadValidationError('上传路径不能包含绝对路径');
  }
  const segments = part.split(/[\\/]+/);
  if (segments.some(segment => segment === '..' || segment === '.' || segment === '')) {
    throw new UploadValidationError('上传路径不能包含上级目录');
  }
}

function assertInsidePath(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new UploadValidationError('上传路径超出书库目录');
}

function resolveUploadPath(audiobookPath, ...parts) {
  for (const part of parts) assertSafePathPart(part);
  const target = path.resolve(audiobookPath, ...parts);
  assertInsidePath(audiobookPath, target);
  return target;
}

function getArchiveEntryPath(entry) {
  if (typeof entry === 'string') return entry;
  return entry?.path || entry?.name || '';
}

function getArchiveEntryType(entry) {
  if (typeof entry === 'string') return '';
  return String(entry?.type || entry?.attributes || '').toLowerCase();
}

function isLinkArchiveEntry(entry) {
  const type = getArchiveEntryType(entry);
  return type.includes('symlink')
    || type.includes('symbolic')
    || type.includes('hardlink')
    || type.includes('hard link')
    || type === 'link'
    || /\bl\b/.test(type);
}

function validateArchiveEntries(audiobookPath, entries) {
  for (const entry of entries) {
    const entryPath = getArchiveEntryPath(entry).replace(/[\\/]+$/, '');
    if (!entryPath) continue;
    if (isLinkArchiveEntry(entry)) {
      throw new UploadValidationError('压缩包内不能包含符号链接或硬链接');
    }
    resolveUploadPath(audiobookPath, entryPath);
  }
}

function parseSevenZipList(output) {
  const entries = [];
  let current = null;
  let inEntries = false;
  const pushCurrent = () => {
    if (current?.path) entries.push(current);
    current = null;
  };

  for (const line of String(output || '').split(/\r?\n/)) {
    if (line.startsWith('----------')) {
      inEntries = true;
      continue;
    }
    if (!inEntries) continue;
    const match = line.match(/^Path = (.+)$/);
    if (match) {
      pushCurrent();
      current = { path: match[1], type: 'file' };
      continue;
    }
    const attributesMatch = line.match(/^Attributes = (.+)$/);
    if (attributesMatch && current) {
      current.type = attributesMatch[1].includes('L') ? 'symlink' : 'file';
    }
  }
  pushCurrent();
  return entries;
}

function parseTarList(output) {
  const entries = [];
  for (const line of String(output || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const typeChar = line[0];
    const match = line.match(/^\S+\s+\d+\s+\S+\s+\S+\s+\d+\s+\S+\s+\d+\s+\S+\s+(.+)$/);
    if (!match) continue;

    const rawPath = match[1].split(' -> ')[0].replace(/^\.\//, '');
    if (!rawPath || rawPath === '.') continue;
    const type = typeChar === 'l'
      ? 'symlink'
      : typeChar === 'h'
        ? 'hardlink'
        : 'file';
    entries.push({ path: rawPath, type });
  }
  return entries;
}

function listArchiveEntries(archivePath) {
  const lower = path.basename(archivePath).toLowerCase();
  if (lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar.bz2') || lower.endsWith('.tar.xz')) {
    const output = execFileSync('tar', ['-tvf', archivePath], { encoding: 'utf8' });
    return parseTarList(output);
  }

  const output = execFileSync('7z', ['l', '-slt', archivePath], { encoding: 'utf8' });
  return parseSevenZipList(output);
}

async function extractArchive(archivePath, outputDir) {
  const lower = path.basename(archivePath).toLowerCase();
  validateArchiveEntries(outputDir, listArchiveEntries(archivePath));

  if (lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar.bz2') || lower.endsWith('.tar.xz')) {
    await execFileAsync('tar', ['-xf', archivePath, '-C', outputDir]);
  } else {
    // .zip, .7z, .rar — all handled by 7z
    await execFileAsync('7z', ['x', archivePath, `-o${outputDir}`, '-y', '-bso0', '-bsp0']);
  }
}

// ========== Helpers ==========

function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    if (e.code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else {
      throw e;
    }
  }
}

function moveDirContents(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    if (entry === '__MACOSX' || entry === '.DS_Store') continue;
    const srcPath = path.join(srcDir, entry);
    const destPath = resolveUploadPath(destDir, entry);
    const stat = fs.lstatSync(srcPath);
    if (stat.isSymbolicLink()) {
      throw new UploadValidationError('压缩包内不能包含符号链接');
    }
    if (stat.isDirectory()) {
      moveDirContents(srcPath, destPath);
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      moveFile(srcPath, destPath);
    }
  }
}

function collectFilesToConvert(dir) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          results.push(...collectFilesToConvert(full));
        } else if (isAudioFile(entry) && needsConversion(entry)) {
          results.push(full);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

function triggerConversion(dir, context = null) {
  const toConvert = collectFilesToConvert(dir);
  if (toConvert.length === 0) return 0;
  console.log(`[Upload] ${toConvert.length} 个文件需要格式转换`);
  (async () => {
    for (const f of toConvert) {
      try { await convertFile(f); } catch (e) {
        console.error(`[Upload] 转换失败: ${path.basename(f)}: ${e.message}`);
      }
    }
    invalidateAudiobookIndexCache(context);
    console.log('[Upload] 上传后格式转换全部完成');
  })();
  return toConvert.length;
}

function cleanTemp(dir) {
  try { if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function stripArchiveExt(name) {
  return name.replace(/\.(zip|7z|rar|tar\.gz|tar\.bz2|tar\.xz|tgz|tar)$/i, '');
}

// ========== Route ==========

/**
 * POST /api/upload
 * mode: "files" | "folder" | "archive"
 */
router.post('/', upload.array('files', 500), async (req, res) => {
  const tempDir = req._tempDir;
  try {
    if (!req.files || req.files.length === 0) {
      cleanTemp(tempDir);
      return res.status(400).json({ success: false, error: '没有收到文件' });
    }

    const mode = req.body.mode || 'files';
    const bookName = (req.body.bookName || '').trim();
    const seasonName = (req.body.seasonName || '').trim();
    const audiobookPath = req.userContext.audiobookPath;

    // Disk space check: files already written to temp, verify enough space remains for move/extract
    const totalUploadSize = req.files.reduce((sum, f) => sum + f.size, 0);
    const available = getAvailableBytes(audiobookPath);
    if (available >= 0 && available < totalUploadSize * 1.1) {
      cleanTemp(tempDir);
      return res.status(507).json({
        success: false,
        error: `磁盘空间不足！需要约 ${formatBytes(totalUploadSize)}，但仅剩 ${formatBytes(available)}。请清理服务器磁盘后重试。`,
      });
    }

    if (mode === 'archive') {
      // ===== Archive mode =====
      const archiveFile = req.files[0];
      const origName = Buffer.from(archiveFile.originalname, 'latin1').toString('utf8');

      const extractDir = path.join(tempDir, '_extracted');
      fs.mkdirSync(extractDir, { recursive: true });

      try {
        await extractArchive(archiveFile.path, extractDir);
      } catch (e) {
        cleanTemp(tempDir);
        return res.status(400).json({ success: false, error: `解压失败: ${e.message}` });
      }

      // Determine structure
      const entries = fs.readdirSync(extractDir).filter(e => !e.startsWith('.') && e !== '__MACOSX');
      let finalBookName = bookName;
      let sourceDir;

      if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
        sourceDir = path.join(extractDir, entries[0]);
        if (!finalBookName) finalBookName = entries[0];
      } else {
        sourceDir = extractDir;
        if (!finalBookName) finalBookName = stripArchiveExt(origName);
      }

      const destDir = resolveUploadPath(audiobookPath, finalBookName);
      moveDirContents(sourceDir, destDir);
      const convertCount = triggerConversion(destDir, req.userContext);
      invalidateAudiobookIndexCache(req.userContext);
      cleanTemp(tempDir);

      console.log(`[Upload] 解压完成: "${finalBookName}"`);
      return res.json({
        success: true,
        data: { bookName: finalBookName, mode: 'archive', convertingCount: convertCount },
      });

    } else if (mode === 'folder') {
      // ===== Folder mode =====
      let relativePaths;
      try { relativePaths = JSON.parse(req.body.relativePaths || '[]'); } catch { relativePaths = []; }

      if (relativePaths.length !== req.files.length) {
        cleanTemp(tempDir);
        return res.status(400).json({ success: false, error: '文件路径信息不匹配' });
      }

      // First path segment is the folder name selected by user
      let finalBookName = bookName;
      if (!finalBookName && relativePaths.length > 0) {
        const segments = relativePaths[0].split('/').filter(Boolean);
        finalBookName = segments.length > 1 ? segments[0] : 'uploaded_book';
      }
      resolveUploadPath(audiobookPath, finalBookName);

      for (let i = 0; i < req.files.length; i++) {
        const relPath = relativePaths[i];
        assertSafePathPart(relPath);
        const segments = relPath.split('/').filter(Boolean);
        // Strip the first segment (selected folder name) — we use finalBookName instead
        const innerPath = segments.length > 1 ? segments.slice(1).join('/') : segments[0];

        const destPath = resolveUploadPath(audiobookPath, finalBookName, innerPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        moveFile(req.files[i].path, destPath);
      }

      const destDir = resolveUploadPath(audiobookPath, finalBookName);
      const convertCount = triggerConversion(destDir, req.userContext);
      invalidateAudiobookIndexCache(req.userContext);
      cleanTemp(tempDir);

      console.log(`[Upload] 文件夹上传完成: "${finalBookName}" (${req.files.length} 个文件)`);
      return res.json({
        success: true,
        data: { bookName: finalBookName, mode: 'folder', uploadedCount: req.files.length, convertingCount: convertCount },
      });

    } else {
      // ===== Files mode (default) =====
      if (!bookName) {
        cleanTemp(tempDir);
        return res.status(400).json({ success: false, error: '请输入书名' });
      }

      let destDir = seasonName
        ? resolveUploadPath(audiobookPath, bookName, seasonName)
        : resolveUploadPath(audiobookPath, bookName);
      fs.mkdirSync(destDir, { recursive: true });

      const uploadedFiles = [];
      for (const file of req.files) {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const destPath = resolveUploadPath(destDir, originalName);
        moveFile(file.path, destPath);
        uploadedFiles.push(originalName);
      }

      const convertCount = triggerConversion(destDir, req.userContext);
      invalidateAudiobookIndexCache(req.userContext);
      cleanTemp(tempDir);

      console.log(`[Upload] 文件上传完成: "${bookName}" (${uploadedFiles.length} 个文件)`);
      return res.json({
        success: true,
        data: { bookName, seasonName, mode: 'files', uploadedCount: uploadedFiles.length, convertingCount: convertCount },
      });
    }
  } catch (e) {
    cleanTemp(tempDir);
    if (e instanceof UploadValidationError) {
      return res.status(e.statusCode).json({ success: false, error: e.message });
    }
    console.error('Upload error:', e);
    res.status(500).json({ success: false, error: e.message || '上传失败' });
  }
});

router.get('/path', (req, res) => {
  const abPath = req.userContext.audiobookPath;
  const available = getAvailableBytes(abPath);
  res.json({
    success: true,
    data: {
      path: abPath,
      availableBytes: available,
      availableFormatted: formatBytes(available),
    },
  });
});

router.delete('/cleanup', (req, res) => {
  cleanupStaleTempDirs(req.userContext.audiobookPath);
  res.json({ success: true, message: '临时文件已清理' });
});

router.use((err, req, res, next) => {
  cleanTemp(req?._tempDir);
  if (err instanceof UploadValidationError) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: '文件过大（单个文件最大 2GB）' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err) return res.status(400).json({ success: false, error: err.message });
  next();
});

router._test = {
  UploadValidationError,
  getAvailableBytes,
  parseDfAvailableBytes,
  listArchiveEntries,
  parseTarList,
  parseSevenZipList,
  makeTempFilename,
  resolveUploadPath,
  validateArchiveEntries,
};

module.exports = router;
