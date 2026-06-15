export const PROGRESS_SAVE_INTERVAL_MS = 8000;
export const PROGRESS_SAVE_MIN_DELTA_SECONDS = 8;
export const PLAYBACK_UI_UPDATE_INTERVAL_MS = 500;
export const MEDIA_SESSION_POSITION_INTERVAL_MS = 8000;
export const MAX_AUDIO_RETRIES = 3;
export const PLAYBACK_RATES = [0.8, 1, 1.25, 1.5, 2];

export function resolveProgressTarget(bookDetail, progress = {}) {
  const seasons = Array.isArray(bookDetail?.seasons) ? bookDetail.seasons : [];
  if (seasons.length === 0) {
    return { seasonIndex: 0, episodeIndex: 0 };
  }

  if (progress.seasonId || progress.episodeId) {
    for (let seasonIndex = 0; seasonIndex < seasons.length; seasonIndex += 1) {
      const season = seasons[seasonIndex];
      if (progress.seasonId && season.id !== progress.seasonId) continue;

      const episodes = Array.isArray(season.episodes) ? season.episodes : [];
      const episodeIndex = episodes.findIndex((episode) => episode.id === progress.episodeId);
      if (episodeIndex >= 0) return { seasonIndex, episodeIndex };
      if (progress.seasonId && episodes.length > 0) return { seasonIndex, episodeIndex: 0 };
    }
  }

  const safeSeasonIndex = clampIndex(progress.seasonIndex, seasons.length);
  const episodes = Array.isArray(seasons[safeSeasonIndex]?.episodes)
    ? seasons[safeSeasonIndex].episodes
    : [];
  const safeEpisodeIndex = clampIndex(progress.episodeIndex, episodes.length);

  return { seasonIndex: safeSeasonIndex, episodeIndex: safeEpisodeIndex };
}

export function shouldSaveProgress({
  currentTime,
  lastSavedSecond = -1,
  lastSavedAt = 0,
  now = Date.now(),
  force = false,
}) {
  const savedSecond = Math.max(0, Math.floor(Number(currentTime) || 0));

  if (force) {
    return { shouldSave: true, savedSecond, savedAt: now };
  }

  const movedEnough = Math.abs(savedSecond - lastSavedSecond) >= PROGRESS_SAVE_MIN_DELTA_SECONDS;
  const waitedEnough = now - lastSavedAt >= PROGRESS_SAVE_INTERVAL_MS;

  return {
    shouldSave: movedEnough && waitedEnough,
    savedSecond,
    savedAt: now,
  };
}

export function shouldUpdatePlaybackUi({
  currentTime,
  lastUiSecond = -1,
  lastUiUpdatedAt = 0,
  now = Date.now(),
  force = false,
}) {
  const uiSecond = Math.max(0, Math.floor(Number(currentTime) || 0));

  if (force) {
    return { shouldUpdate: true, uiSecond, updatedAt: now };
  }

  const secondChanged = uiSecond !== lastUiSecond;
  const waitedEnough = now - lastUiUpdatedAt >= PLAYBACK_UI_UPDATE_INTERVAL_MS;

  return {
    shouldUpdate: secondChanged && waitedEnough,
    uiSecond,
    updatedAt: now,
  };
}

export function shouldSyncMediaSessionPosition({
  currentTime,
  lastSyncedSecond = -1,
  lastSyncedAt = 0,
  now = Date.now(),
  force = false,
}) {
  const syncedSecond = Math.max(0, Math.floor(Number(currentTime) || 0));

  if (force) {
    return { shouldSync: true, syncedSecond, syncedAt: now };
  }

  const movedEnough = Math.abs(syncedSecond - lastSyncedSecond) >= 5;
  const waitedEnough = now - lastSyncedAt >= MEDIA_SESSION_POSITION_INTERVAL_MS;

  return {
    shouldSync: movedEnough && waitedEnough,
    syncedSecond,
    syncedAt: now,
  };
}

export function getSleepTimerSnapshot({ mode, minutes, now = Date.now() }) {
  if (mode === 'episode') {
    return {
      mode: 'episode',
      endsAt: null,
      remainingMs: null,
      label: '播完本集',
    };
  }

  const numericMinutes = Number(minutes);
  if (mode !== 'minutes' || !Number.isFinite(numericMinutes) || numericMinutes <= 0) {
    return null;
  }

  const remainingMs = Math.round(numericMinutes * 60 * 1000);
  return {
    mode: 'minutes',
    endsAt: now + remainingMs,
    remainingMs,
    label: `${numericMinutes} 分钟`,
  };
}

export function getRetryDelay(retryCount) {
  const normalized = Math.max(0, Number(retryCount) || 0);
  return Math.min(8000, 1200 * 2 ** normalized);
}

export function clampSeekTime(time, duration) {
  const normalizedTime = Math.max(0, Number(time) || 0);
  if (!Number.isFinite(duration) || duration <= 0) return normalizedTime;
  return Math.min(duration, normalizedTime);
}

export function normalizePlaybackRate(rate) {
  const normalized = Number(rate);
  if (!Number.isFinite(normalized)) return 1;
  return PLAYBACK_RATES.includes(normalized) ? normalized : 1;
}

function clampIndex(value, length) {
  if (length <= 0) return 0;
  const index = Number.isInteger(value) ? value : 0;
  return Math.max(0, Math.min(length - 1, index));
}
