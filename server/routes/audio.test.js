const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const express = require('express');

const audioRouter = require('./audio');
const { invalidateAudiobookIndexCache, scanAudiobooks } = require('../services/scanner');

function makeLibrary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audiooook-audio-route-'));
  const bookDir = path.join(dir, 'Range Book');
  fs.mkdirSync(bookDir, { recursive: true });
  fs.writeFileSync(path.join(bookDir, '001.mp3'), '0123456789');

  const context = { userId: `test-${path.basename(dir)}`, audiobookPath: dir };
  const [book] = scanAudiobooks(context);
  const [season] = book.seasons;
  const [episode] = season.episodes;

  return {
    context,
    ids: {
      bookId: book.id,
      seasonId: season.id,
      episodeId: episode.id,
    },
    cleanup() {
      invalidateAudiobookIndexCache(context);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function createServer(context) {
  const app = express();
  app.use((req, _res, next) => {
    req.userContext = context;
    next();
  });
  app.use('/api/audio', audioRouter);
  return http.createServer(app);
}

function requestAudio(server, ids, range) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const options = {
        hostname: '127.0.0.1',
        port,
        path: `/api/audio/${ids.bookId}/${ids.seasonId}/${ids.episodeId}`,
        method: 'GET',
        headers: range ? { Range: range } : {},
      };

      const req = http.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          server.close(() => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        });
      });

      req.on('error', (error) => {
        server.close(() => reject(error));
      });
      req.end();
    });
  });
}

async function withAudioResponse(range) {
  const library = makeLibrary();
  const server = createServer(library.context);
  try {
    return await requestAudio(server, library.ids, range);
  } finally {
    library.cleanup();
  }
}

test('streams the full audio file without Range as 200', async () => {
  const response = await withAudioResponse();

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['accept-ranges'], 'bytes');
  assert.equal(response.headers['content-length'], '10');
  assert.equal(response.body, '0123456789');
});

test('streams a bounded byte range as 206', async () => {
  const response = await withAudioResponse('bytes=2-5');

  assert.equal(response.statusCode, 206);
  assert.equal(response.headers['content-range'], 'bytes 2-5/10');
  assert.equal(response.headers['content-length'], '4');
  assert.equal(response.body, '2345');
});

test('streams a suffix byte range as 206', async () => {
  const response = await withAudioResponse('bytes=-5');

  assert.equal(response.statusCode, 206);
  assert.equal(response.headers['content-range'], 'bytes 5-9/10');
  assert.equal(response.headers['content-length'], '5');
  assert.equal(response.body, '56789');
});

test('streams an open ended byte range as 206', async () => {
  const response = await withAudioResponse('bytes=5-');

  assert.equal(response.statusCode, 206);
  assert.equal(response.headers['content-range'], 'bytes 5-9/10');
  assert.equal(response.headers['content-length'], '5');
  assert.equal(response.body, '56789');
});

test('rejects malformed Range as 416', async () => {
  const response = await withAudioResponse('bytes=abc-');

  assert.equal(response.statusCode, 416);
  assert.equal(response.headers['content-range'], 'bytes */10');
  assert.equal(response.body, '');
});

test('rejects an unsatisfiable Range starting at file size as 416', async () => {
  const response = await withAudioResponse('bytes=10-');

  assert.equal(response.statusCode, 416);
  assert.equal(response.headers['content-range'], 'bytes */10');
  assert.equal(response.body, '');
});

test('rejects a Range whose end is before start as 416', async () => {
  const response = await withAudioResponse('bytes=6-3');

  assert.equal(response.statusCode, 416);
  assert.equal(response.headers['content-range'], 'bytes */10');
  assert.equal(response.body, '');
});

test('clamps a Range whose end is beyond the file as 206', async () => {
  const response = await withAudioResponse('bytes=5-99');

  assert.equal(response.statusCode, 206);
  assert.equal(response.headers['content-range'], 'bytes 5-9/10');
  assert.equal(response.headers['content-length'], '5');
  assert.equal(response.body, '56789');
});
