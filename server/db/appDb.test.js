const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAppDb } = require('./appDb');

function makeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audiooook-db-'));
  const dbPath = path.join(dir, 'test.sqlite');
  return {
    dir,
    db: createAppDb({ dbPath, seedDefaultUser: false }),
  };
}

test('creates users with hashed passwords and verifies credentials', () => {
  const { db } = makeDb();

  const user = db.createUser('alice', 'secret123', { audiobookPath: '/tmp/alice-books' });

  assert.equal(user.username, 'alice');
  assert.equal(user.audiobookPath, '/tmp/alice-books');
  assert.equal(db.authenticateUser('alice', 'wrong'), null);
  assert.equal(db.authenticateUser('alice', 'secret123').id, user.id);

  const row = db.db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(user.id);
  assert.notEqual(row.password_hash, 'secret123');
  assert.ok(row.password_salt.length > 20);
});

test('keeps favorites, progress, settings, and metadata isolated by user', () => {
  const { db } = makeDb();
  const alice = db.createUser('alice', 'secret123');
  const bob = db.createUser('bob', 'secret123');

  db.putFavorite(alice.id, 'book-1', { name: 'Alice Book' });
  db.putFavorite(bob.id, 'book-1', { name: 'Bob Book' });
  db.putProgress(alice.id, 'book-1', { currentTime: 88 });
  db.updateSettings(alice.id, { theme: 'light' });
  db.updateSettings(bob.id, { theme: 'dark' });
  db.updateMetadata(alice.id, 'book-1', { customName: 'Alice Custom' });
  db.updateMetadata(bob.id, 'book-1', { customName: 'Bob Custom' });

  assert.equal(db.listFavorites(alice.id)[0].name, 'Alice Book');
  assert.equal(db.listFavorites(bob.id)[0].name, 'Bob Book');
  assert.equal(db.listProgress(alice.id)[0].currentTime, 88);
  assert.deepEqual(db.listProgress(bob.id), []);
  assert.equal(db.getSettings(alice.id).theme, 'light');
  assert.equal(db.getSettings(bob.id).theme, 'dark');
  assert.equal(db.getMetadata(alice.id, 'book-1').customName, 'Alice Custom');
  assert.equal(db.getMetadata(bob.id, 'book-1').customName, 'Bob Custom');
});

test('creates and validates expiring sessions by token hash', () => {
  const { db } = makeDb();
  const user = db.createUser('alice', 'secret123');

  const session = db.createSession(user.id, 60_000);
  const found = db.getSession(session.token);

  assert.equal(found.user.username, 'alice');
  assert.equal(db.getSession('bad-token'), null);

  const stored = db.db.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').get(user.id);
  assert.notEqual(stored.token_hash, session.token);
});
