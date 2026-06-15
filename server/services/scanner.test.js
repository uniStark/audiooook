const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  getBookDetail,
  invalidateAudiobookIndexCache,
  scanAudiobooks,
} = require('./scanner');

function makeLibrary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audiooook-scanner-'));
  return {
    dir,
    writeEpisode(bookName, episodeName = '001.mp3') {
      const bookDir = path.join(dir, bookName);
      fs.mkdirSync(bookDir, { recursive: true });
      fs.writeFileSync(path.join(bookDir, episodeName), Buffer.alloc(8));
    },
    cleanup() {
      invalidateAudiobookIndexCache({ audiobookPath: dir });
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('reuses a short-lived audiobook index for repeated detail lookups in the same user context', () => {
  const library = makeLibrary();
  library.writeEpisode('Shared Book');
  const context = { userId: 'alice', audiobookPath: library.dir };

  try {
    const [book] = scanAudiobooks(context);
    library.writeEpisode('New Book');

    const detail = getBookDetail(context, book.id);
    const cachedBooks = scanAudiobooks(context);

    assert.equal(detail.id, book.id);
    assert.deepEqual(cachedBooks.map(b => b.folderName), ['Shared Book']);
  } finally {
    library.cleanup();
  }
});

test('invalidates a user audiobook index so the next scan sees changed files', () => {
  const library = makeLibrary();
  library.writeEpisode('Before');
  const context = { userId: 'alice', audiobookPath: library.dir };

  try {
    assert.deepEqual(scanAudiobooks(context).map(b => b.folderName), ['Before']);

    library.writeEpisode('After');
    invalidateAudiobookIndexCache(context);

    assert.deepEqual(
      scanAudiobooks(context).map(b => b.folderName).sort(),
      ['After', 'Before'],
    );
  } finally {
    library.cleanup();
  }
});

test('keeps audiobook index caches isolated by user context', () => {
  const aliceLibrary = makeLibrary();
  const bobLibrary = makeLibrary();
  aliceLibrary.writeEpisode('Same Name', '001.mp3');
  bobLibrary.writeEpisode('Same Name', '001.mp3');
  bobLibrary.writeEpisode('Bob Only', '001.mp3');

  const alice = { userId: 'alice', audiobookPath: aliceLibrary.dir };
  const bob = { userId: 'bob', audiobookPath: bobLibrary.dir };

  try {
    assert.deepEqual(scanAudiobooks(alice).map(b => b.folderName), ['Same Name']);
    assert.deepEqual(
      scanAudiobooks(bob).map(b => b.folderName).sort(),
      ['Bob Only', 'Same Name'],
    );
  } finally {
    aliceLibrary.cleanup();
    bobLibrary.cleanup();
  }
});
