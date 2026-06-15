const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('convertFile tells FFmpeg the container format for .m4a temp files', async () => {
  const childProcess = require('node:child_process');
  const originalSpawn = childProcess.spawn;
  let capturedArgs = null;

  childProcess.spawn = (_command, args) => {
    capturedArgs = args;
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();

    process.nextTick(() => {
      fs.writeFileSync(args[args.length - 1], Buffer.alloc(2048));
      proc.emit('close', 0);
    });

    return proc;
  };

  delete require.cache[require.resolve('./converter')];
  const { convertFile } = require('./converter');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audiooook-converter-'));
  const inputPath = path.join(tempDir, 'sample.wma');
  fs.writeFileSync(inputPath, Buffer.alloc(2048));

  try {
    await convertFile(inputPath);
    assert.ok(capturedArgs, 'FFmpeg should be invoked');

    const outputArgIndex = capturedArgs.length - 1;
    assert.deepEqual(
      capturedArgs.slice(outputArgIndex - 2, outputArgIndex),
      ['-f', 'mp4'],
    );
  } finally {
    childProcess.spawn = originalSpawn;
    delete require.cache[require.resolve('./converter')];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
