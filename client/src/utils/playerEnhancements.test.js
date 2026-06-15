import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSeekTime,
  getRetryDelay,
  getSleepTimerSnapshot,
  normalizePlaybackRate,
  resolveProgressTarget,
  shouldSyncMediaSessionPosition,
  shouldSaveProgress,
  shouldUpdatePlaybackUi,
} from './playerEnhancements.js';

test('resolveProgressTarget prefers saved season and episode ids', () => {
  const bookDetail = {
    seasons: [
      { id: 's1', episodes: [{ id: 'e1' }] },
      { id: 's2', episodes: [{ id: 'e2' }, { id: 'e3' }] },
    ],
  };

  assert.deepEqual(
    resolveProgressTarget(bookDetail, {
      seasonId: 's2',
      episodeId: 'e3',
      seasonIndex: 0,
      episodeIndex: 0,
    }),
    { seasonIndex: 1, episodeIndex: 1 },
  );
});

test('resolveProgressTarget falls back to safe indexes', () => {
  const bookDetail = {
    seasons: [
      { id: 's1', episodes: [{ id: 'e1' }] },
      { id: 's2', episodes: [{ id: 'e2' }] },
    ],
  };

  assert.deepEqual(
    resolveProgressTarget(bookDetail, { seasonIndex: 9, episodeIndex: 9 }),
    { seasonIndex: 1, episodeIndex: 0 },
  );
});

test('shouldSaveProgress throttles repeated saves in the same interval', () => {
  const first = shouldSaveProgress({
    currentTime: 12.4,
    lastSavedSecond: 0,
    lastSavedAt: 0,
    now: 10_000,
  });

  assert.equal(first.shouldSave, true);
  assert.equal(first.savedSecond, 12);

  const repeated = shouldSaveProgress({
    currentTime: 14.1,
    lastSavedSecond: first.savedSecond,
    lastSavedAt: 10_000,
    now: 12_000,
  });

  assert.equal(repeated.shouldSave, false);
});

test('shouldSaveProgress can force saves for page lifecycle events', () => {
  const result = shouldSaveProgress({
    currentTime: 14.1,
    lastSavedSecond: 14,
    lastSavedAt: 12_000,
    now: 12_100,
    force: true,
  });

  assert.equal(result.shouldSave, true);
  assert.equal(result.savedSecond, 14);
});

test('shouldUpdatePlaybackUi throttles frequent audio time updates', () => {
  const first = shouldUpdatePlaybackUi({
    currentTime: 10.1,
    lastUiSecond: 9,
    lastUiUpdatedAt: 1_000,
    now: 1_200,
  });
  assert.equal(first.shouldUpdate, false);

  const later = shouldUpdatePlaybackUi({
    currentTime: 10.6,
    lastUiSecond: 9,
    lastUiUpdatedAt: 1_000,
    now: 1_550,
  });
  assert.equal(later.shouldUpdate, true);
  assert.equal(later.uiSecond, 10);
});

test('shouldSyncMediaSessionPosition avoids per-frame lock screen updates', () => {
  const frequent = shouldSyncMediaSessionPosition({
    currentTime: 33,
    lastSyncedSecond: 30,
    lastSyncedAt: 10_000,
    now: 12_000,
  });
  assert.equal(frequent.shouldSync, false);

  const periodic = shouldSyncMediaSessionPosition({
    currentTime: 38,
    lastSyncedSecond: 30,
    lastSyncedAt: 10_000,
    now: 18_500,
  });
  assert.equal(periodic.shouldSync, true);
  assert.equal(periodic.syncedSecond, 38);
});

test('getSleepTimerSnapshot supports minutes and end-of-episode modes', () => {
  assert.deepEqual(
    getSleepTimerSnapshot({ mode: 'minutes', minutes: 30, now: 1_000 }),
    {
      mode: 'minutes',
      endsAt: 1_801_000,
      remainingMs: 1_800_000,
      label: '30 分钟',
    },
  );

  assert.deepEqual(
    getSleepTimerSnapshot({ mode: 'episode', now: 1_000 }),
    {
      mode: 'episode',
      endsAt: null,
      remainingMs: null,
      label: '播完本集',
    },
  );
});

test('getRetryDelay returns capped exponential backoff', () => {
  assert.equal(getRetryDelay(0), 1200);
  assert.equal(getRetryDelay(1), 2400);
  assert.equal(getRetryDelay(8), 8000);
});

test('clampSeekTime keeps media session seek values within duration', () => {
  assert.equal(clampSeekTime(-10, 100), 0);
  assert.equal(clampSeekTime(120, 100), 100);
  assert.equal(clampSeekTime(50, 100), 50);
  assert.equal(clampSeekTime(50, Number.NaN), 50);
});

test('normalizePlaybackRate only accepts supported audiobook speeds', () => {
  assert.equal(normalizePlaybackRate(1.25), 1.25);
  assert.equal(normalizePlaybackRate('1.5'), 1.5);
  assert.equal(normalizePlaybackRate(3), 1);
  assert.equal(normalizePlaybackRate('fast'), 1);
});
