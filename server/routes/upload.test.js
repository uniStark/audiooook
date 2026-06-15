const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const uploadRoute = require('./upload');

function makeLibrary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audiooook-upload-'));
  return {
    dir,
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function assertBadUploadPath(fn, message) {
  assert.throws(
    fn,
    err => err && err.name === 'UploadValidationError' && err.statusCode === 400,
    message,
  );
}

test('disk space detection returns -1 when native statfs and df are unavailable', () => {
  const available = uploadRoute._test.getAvailableBytes('/tmp/audiooook', {
    statfsSync() {
      throw new Error('statfs unavailable');
    },
    execFileSync() {
      throw new Error('df unavailable');
    },
  });

  assert.equal(available, -1);
});

test('disk space detection treats unparsable df output as unknown instead of zero', () => {
  const available = uploadRoute._test.getAvailableBytes('/tmp/audiooook', {
    statfsSync() {
      throw new Error('statfs unavailable');
    },
    execFileSync() {
      return 'Filesystem 512-blocks Used Available Capacity Mounted on\n/dev/disk3s1s1 broken\n';
    },
  });

  assert.equal(available, -1);
});

test('safe upload paths stay inside the audiobook library', () => {
  const library = makeLibrary();

  try {
    const target = uploadRoute._test.resolveUploadPath(
      library.dir,
      'Book',
      'Season 1',
      '001.mp3',
    );

    assert.equal(target, path.join(library.dir, 'Book', 'Season 1', '001.mp3'));
  } finally {
    library.cleanup();
  }
});

test('bookName and seasonName traversal cannot escape the audiobook library', () => {
  const library = makeLibrary();

  try {
    assertBadUploadPath(
      () => uploadRoute._test.resolveUploadPath(library.dir, '../outside', '001.mp3'),
      'bookName traversal should be rejected',
    );
    assertBadUploadPath(
      () => uploadRoute._test.resolveUploadPath(library.dir, 'Book', '/tmp/season', '001.mp3'),
      'seasonName absolute path should be rejected',
    );
    assertBadUploadPath(
      () => uploadRoute._test.resolveUploadPath(library.dir, '.', '001.mp3'),
      'bookName dot segment should be rejected',
    );
    assertBadUploadPath(
      () => uploadRoute._test.resolveUploadPath(library.dir, 'Book', '.', '001.mp3'),
      'seasonName dot segment should be rejected',
    );
  } finally {
    library.cleanup();
  }
});

test('relativePaths and originalName traversal cannot escape the audiobook library', () => {
  const library = makeLibrary();

  try {
    assertBadUploadPath(
      () => uploadRoute._test.resolveUploadPath(library.dir, 'Book', '../escape.mp3'),
      'relative path traversal should be rejected',
    );
    assertBadUploadPath(
      () => uploadRoute._test.resolveUploadPath(library.dir, 'Book', '/tmp/escape.mp3'),
      'absolute originalName should be rejected',
    );
  } finally {
    library.cleanup();
  }
});

test('temporary upload filename never includes originalName path segments', () => {
  const tempName = uploadRoute._test.makeTempFilename(7, '../../escape.mp3');

  assert.equal(tempName, '7.mp3');
  assert.equal(tempName.includes('/'), false);
  assert.equal(tempName.includes('\\'), false);
  assert.equal(tempName.includes('..'), false);
});

test('archive entries with traversal or absolute paths are rejected before extraction', () => {
  const entries = [
    { path: 'Book/001.mp3', type: 'file' },
    { path: '../escape.mp3', type: 'file' },
    { path: '/tmp/escape.mp3', type: 'file' },
  ];

  assertBadUploadPath(
    () => uploadRoute._test.validateArchiveEntries('/tmp/audiooook', entries),
    'archive entry traversal should be rejected',
  );
});

test('archive directory entries with traversal are also rejected', () => {
  assertBadUploadPath(
    () => uploadRoute._test.validateArchiveEntries('/tmp/audiooook', ['../escape/']),
    'archive directory traversal should be rejected',
  );
});

test('archive symbolic and hard links are rejected before extraction', () => {
  assertBadUploadPath(
    () => uploadRoute._test.validateArchiveEntries('/tmp/audiooook', [
      { path: 'Book/link.mp3', type: 'symlink' },
    ]),
    'archive symlink should be rejected',
  );
  assertBadUploadPath(
    () => uploadRoute._test.validateArchiveEntries('/tmp/audiooook', [
      { path: 'Book/link.mp3', type: 'hardlink' },
    ]),
    'archive hardlink should be rejected',
  );
});

test('7z listing parser ignores archive metadata path and validates only entries', () => {
  const output = [
    'Path = /tmp/uploads/archive.zip',
    'Type = zip',
    '----------',
    'Path = Book/001.mp3',
    'Attributes = A',
    'Size = 12',
    '',
  ].join('\n');

  assert.deepEqual(uploadRoute._test.parseSevenZipList(output), [
    { path: 'Book/001.mp3', type: 'file' },
  ]);
});

test('7z listing parser preserves symlink attributes for validation', () => {
  const output = [
    '----------',
    'Path = Book/link.mp3',
    'Attributes = L',
    '',
  ].join('\n');

  assert.deepEqual(uploadRoute._test.parseSevenZipList(output), [
    { path: 'Book/link.mp3', type: 'symlink' },
  ]);
});

test('tar listing parser preserves symlink type before extraction', () => {
  const output = [
    'drwxr-xr-x  0 beamstark wheel       0 May 10 06:52 ./',
    'drwxr-xr-x  0 beamstark wheel       0 May 10 06:52 ./Book/',
    '-rw-r--r--  0 beamstark wheel       1 May 10 06:52 ./Book/001.mp3',
    'lrwxr-xr-x  0 beamstark wheel       0 May 10 06:52 ./Book/link.mp3 -> ../escape',
  ].join('\n');

  assert.deepEqual(uploadRoute._test.parseTarList(output), [
    { path: 'Book/', type: 'file' },
    { path: 'Book/001.mp3', type: 'file' },
    { path: 'Book/link.mp3', type: 'symlink' },
  ]);
});

test('real tar archives with symlinks are rejected before extraction', () => {
  const library = makeLibrary();
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audiooook-tar-src-'));
  const archivePath = path.join(library.dir, 'symlink.tar');

  try {
    fs.mkdirSync(path.join(sourceDir, 'Book'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'Book', '001.mp3'), 'audio');
    fs.symlinkSync('../escape', path.join(sourceDir, 'Book', 'link.mp3'));

    require('node:child_process').execFileSync('tar', ['-cf', archivePath, '-C', sourceDir, '.']);

    assertBadUploadPath(
      () => uploadRoute._test.validateArchiveEntries(
        library.dir,
        uploadRoute._test.listArchiveEntries(archivePath),
      ),
      'real tar symlink should be rejected',
    );
  } finally {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    library.cleanup();
  }
});
