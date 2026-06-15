/**
 * 播放器状态管理
 * 使用 Zustand 维护全局 Audio、断点续听、睡眠定时和锁屏控制。
 */
import { create } from 'zustand';
import { bookApi } from '../utils/api';
import { savePlayProgress, getPlayProgress, getCachedAudio, getSetting, setSetting } from '../utils/db';
import {
  MAX_AUDIO_RETRIES,
  clampSeekTime,
  getRetryDelay,
  getSleepTimerSnapshot,
  normalizePlaybackRate,
  resolveProgressTarget,
  shouldSyncMediaSessionPosition,
  shouldSaveProgress,
  shouldUpdatePlaybackUi,
} from '../utils/playerEnhancements';

let audioElement = null;
let playerInitialized = false;
let lifecycleInitialized = false;
let currentObjectUrl = null;
let retryTimeoutId = null;
let sleepTimeoutId = null;
let sleepIntervalId = null;
let lastSavedAt = 0;
let lastSavedSecond = -1;
let lastUiUpdatedAt = 0;
let lastUiSecond = -1;
let lastMediaSessionSyncedAt = 0;
let lastMediaSessionSyncedSecond = -1;

function getAudio() {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.preload = 'auto';
  }
  return audioElement;
}

function clearRetryTimer() {
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
}

function clearObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

function clearSleepTimers() {
  if (sleepTimeoutId) {
    clearTimeout(sleepTimeoutId);
    sleepTimeoutId = null;
  }
  if (sleepIntervalId) {
    clearInterval(sleepIntervalId);
    sleepIntervalId = null;
  }
}

function safeMediaSession(handler) {
  try {
    handler();
  } catch {
    // Some mobile browsers expose partial Media Session support.
  }
}

function syncMediaSessionState(state) {
  if (!('mediaSession' in navigator)) return;

  safeMediaSession(() => {
    navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
  });

  const duration = Number(state.duration);
  const position = Number(state.currentTime);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;

  safeMediaSession(() => {
    navigator.mediaSession.setPositionState?.({
      duration,
      playbackRate: state.playbackRate || 1,
      position: clampSeekTime(position, duration),
    });
  });
}

function setupMediaSession(get) {
  if (!('mediaSession' in navigator)) return;

  const setHandler = (action, handler) => {
    safeMediaSession(() => navigator.mediaSession.setActionHandler(action, handler));
  };

  setHandler('play', () => get().play());
  setHandler('pause', () => get().pause());
  setHandler('previoustrack', () => get().playPrev());
  setHandler('nexttrack', () => get().playNext());
  setHandler('seekbackward', (details) => get().seekRelative(-(details?.seekOffset || 15)));
  setHandler('seekforward', (details) => get().seekRelative(details?.seekOffset || 15));
  setHandler('seekto', (details) => {
    if (typeof details?.seekTime === 'number') get().seekTo(details.seekTime);
  });
}

function setupLifecycleHandlers(get) {
  if (lifecycleInitialized || typeof window === 'undefined') return;
  lifecycleInitialized = true;

  const saveNow = () => get().saveProgress({ force: true });

  window.addEventListener('pagehide', saveNow);
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('online', () => get().setNetworkStatus('online'));
  window.addEventListener('offline', () => get().setNetworkStatus('offline'));
}

function getAbsoluteUrl(url) {
  if (typeof window === 'undefined') return url;
  return new URL(url, window.location.origin).href;
}

const usePlayerStore = create((set, get) => ({
  isPlaying: false,
  currentBook: null,
  currentSeason: null,
  currentEpisode: null,
  currentSeasonIndex: 0,
  currentEpisodeIndex: 0,

  currentTime: 0,
  duration: 0,
  buffered: 0,
  playbackRate: 1,
  isLoading: false,
  error: null,
  retryCount: 0,
  networkStatus: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',

  bookDetail: null,
  skipIntro: 0,
  skipOutro: 0,
  sleepTimer: null,
  sleepTimerRemaining: null,

  initPlayer: () => {
    const audio = getAudio();
    if (playerInitialized) return;
    playerInitialized = true;

    getSetting('playbackRate', 1).then((storedRate) => {
      get().setPlaybackRate(storedRate, { persist: false });
    }).catch(() => {});

    audio.addEventListener('timeupdate', () => {
      const state = get();
      const currentTime = audio.currentTime;
      const now = Date.now();
      const uiDecision = shouldUpdatePlaybackUi({
        currentTime,
        lastUiSecond,
        lastUiUpdatedAt,
        now,
      });

      if (uiDecision.shouldUpdate) {
        lastUiSecond = uiDecision.uiSecond;
        lastUiUpdatedAt = uiDecision.updatedAt;
        set({ currentTime });
      }

      if (state.skipOutro > 0 && state.duration > 0 && currentTime >= state.duration - state.skipOutro) {
        get().playNext();
        return;
      }

      get().saveProgress({ currentTimeOverride: currentTime });
      const mediaDecision = shouldSyncMediaSessionPosition({
        currentTime,
        lastSyncedSecond: lastMediaSessionSyncedSecond,
        lastSyncedAt: lastMediaSessionSyncedAt,
        now,
      });
      if (mediaDecision.shouldSync) {
        lastMediaSessionSyncedSecond = mediaDecision.syncedSecond;
        lastMediaSessionSyncedAt = mediaDecision.syncedAt;
        syncMediaSessionState({ ...get(), currentTime });
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      const dur = audio.duration;
      if (Number.isFinite(dur) && dur > 0) {
        set({ duration: dur, isLoading: false });
      }
      audio.playbackRate = get().playbackRate || 1;

      const state = get();
      if (state.skipIntro > 0 && audio.currentTime < state.skipIntro) {
        audio.currentTime = state.skipIntro;
      }
      syncMediaSessionState(get());
    });

    audio.addEventListener('durationchange', () => {
      const dur = audio.duration;
      if (Number.isFinite(dur) && dur > 0) {
        set({ duration: dur });
        syncMediaSessionState(get());
      }
    });

    audio.addEventListener('waiting', () => set({ isLoading: true }));
    audio.addEventListener('stalled', () => get().handleAudioIssue('网络不稳定，正在尝试恢复'));
    audio.addEventListener('canplay', () => {
      clearRetryTimer();
      set({ isLoading: false, error: null, retryCount: 0, networkStatus: 'online' });
    });
    audio.addEventListener('playing', () => {
      set({ isPlaying: true, isLoading: false, error: null });
      syncMediaSessionState(get());
    });
    audio.addEventListener('pause', () => {
      set({ isPlaying: false });
      get().saveProgress({ force: true });
      syncMediaSessionState(get());
    });
    audio.addEventListener('seeked', () => {
      set({ currentTime: audio.currentTime });
      get().saveProgress({ force: true });
      syncMediaSessionState(get());
    });
    audio.addEventListener('ended', () => {
      const state = get();
      get().saveProgress({ force: true });
      if (state.sleepTimer?.mode === 'episode') {
        get().pause();
        get().clearSleepTimer();
        return;
      }
      get().playNext();
    });
    audio.addEventListener('error', () => get().handleAudioIssue('音频加载失败，正在尝试恢复'));
    audio.addEventListener('progress', () => {
      if (audio.buffered.length > 0) {
        set({ buffered: audio.buffered.end(audio.buffered.length - 1) });
      }
    });

    setupMediaSession(get);
    setupLifecycleHandlers(get);
  },

  setNetworkStatus: (networkStatus) => {
    set({ networkStatus });
  },

  setPlaybackRate: async (rate, { persist = true } = {}) => {
    const playbackRate = normalizePlaybackRate(rate);
    const audio = getAudio();
    audio.playbackRate = playbackRate;
    set({ playbackRate });
    syncMediaSessionState(get());
    if (persist) {
      await setSetting('playbackRate', playbackRate);
    }
  },

  handleAudioIssue: (message) => {
    const state = get();
    if (!state.currentBook || !state.currentEpisode || state.retryCount >= MAX_AUDIO_RETRIES) {
      set({ error: message || '音频加载失败', isLoading: false, isPlaying: false });
      return;
    }

    clearRetryTimer();
    const nextRetryCount = state.retryCount + 1;
    const retryAtTime = getAudio().currentTime || state.currentTime || 0;
    set({
      error: message,
      isLoading: true,
      networkStatus: 'retrying',
      retryCount: nextRetryCount,
    });

    retryTimeoutId = setTimeout(() => {
      get().retryCurrentEpisode(retryAtTime);
    }, getRetryDelay(state.retryCount));
  },

  retryCurrentEpisode: async (seekTime = null) => {
    const state = get();
    if (!state.currentBook || !state.currentSeason || !state.currentEpisode) return;

    const audio = getAudio();
    const wasPlaying = state.isPlaying;
    const resumeAt = clampSeekTime(seekTime ?? audio.currentTime ?? state.currentTime, state.duration);

    try {
      set({ isLoading: true, error: null });
      audio.load();
      await new Promise((resolve) => {
        const onMetadata = () => {
          audio.removeEventListener('loadedmetadata', onMetadata);
          resolve();
        };
        audio.addEventListener('loadedmetadata', onMetadata, { once: true });
        setTimeout(resolve, 800);
      });
      audio.currentTime = resumeAt;
      if (wasPlaying) await get().play();
      set({ isLoading: false, networkStatus: 'online' });
    } catch (e) {
      console.error('Retry failed:', e);
      set({ error: e.message || '重试失败', isLoading: false, isPlaying: false });
    }
  },

  playEpisode: async (book, seasonIndex, episodeIndex, seekTime = 0) => {
    const audio = getAudio();
    clearRetryTimer();
    clearObjectUrl();
    set({ isLoading: true, error: null, retryCount: 0, networkStatus: 'online' });

    try {
      let bookDetail = get().bookDetail;
      if (!bookDetail || bookDetail.id !== book.id) {
        const res = await bookApi.getBook(book.id);
        bookDetail = res.data;
        set({ bookDetail });
      }

      const season = bookDetail.seasons[seasonIndex];
      if (!season) throw new Error('季不存在');

      const episode = season.episodes[episodeIndex];
      if (!episode) throw new Error('集不存在');

      const cacheKey = `${book.id}_${season.id}_${episode.id}`;
      const shouldUseOfflineCache = typeof navigator !== 'undefined' && navigator.onLine === false;
      const cached = shouldUseOfflineCache ? await getCachedAudio(cacheKey) : null;

      if (cached?.blob) {
        currentObjectUrl = URL.createObjectURL(cached.blob);
        audio.src = currentObjectUrl;
      } else {
        audio.src = bookApi.getAudioUrl(book.id, season.id, episode.id);
      }
      audio.playbackRate = get().playbackRate || 1;

      const skipIntro = bookDetail.skipIntro || 0;
      const skipOutro = bookDetail.skipOutro || 0;

      set({
        currentBook: book,
        currentSeason: season,
        currentEpisode: episode,
        currentSeasonIndex: seasonIndex,
        currentEpisodeIndex: episodeIndex,
        skipIntro,
        skipOutro,
        isPlaying: false,
      });

      audio.load();

      if (seekTime > 0) {
        audio.addEventListener('loadedmetadata', function onLoaded() {
          audio.currentTime = seekTime;
          audio.removeEventListener('loadedmetadata', onLoaded);
        });
      }

      if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
        safeMediaSession(() => {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: episode.name,
            artist: season.name,
            album: book.name,
            artwork: [
              {
                src: getAbsoluteUrl(bookApi.getArtworkUrl(book.id)),
                sizes: '512x512',
              },
            ],
          });
        });
      }

      await get().play();
    } catch (e) {
      console.error('Play error:', e);
      set({ error: e.message, isLoading: false, isPlaying: false });
      syncMediaSessionState(get());
    }
  },

  resumeBook: async (book) => {
    const progress = await getPlayProgress(book.id);
    if (progress) {
      let bookDetail = get().bookDetail;
      if (!bookDetail || bookDetail.id !== book.id) {
        const res = await bookApi.getBook(book.id);
        bookDetail = res.data;
        set({ bookDetail });
      }
      const target = resolveProgressTarget(bookDetail, progress);
      const rewindSec = await getSetting('resumeRewindSeconds', 3);
      const seekTime = Math.max(0, (progress.currentTime || 0) - rewindSec);
      await get().playEpisode(book, target.seasonIndex, target.episodeIndex, seekTime);
    } else {
      await get().playEpisode(book, 0, 0);
    }
  },

  play: async () => {
    const audio = getAudio();
    try {
      await audio.play();
      set({ isPlaying: true, isLoading: false, error: null });
    } catch (e) {
      console.error('Play failed:', e);
      set({ error: e.message || '播放失败', isPlaying: false, isLoading: false });
    }
    syncMediaSessionState(get());
  },

  pause: () => {
    const audio = getAudio();
    audio.pause();
    set({ isPlaying: false, isLoading: false });
    get().saveProgress({ force: true });
    syncMediaSessionState(get());
  },

  togglePlay: () => {
    if (get().isPlaying) {
      get().pause();
    } else {
      get().play();
    }
  },

  seekRelative: (seconds) => {
    const audio = getAudio();
    const maxTime = Number.isFinite(audio.duration) ? audio.duration : get().duration || 0;
    if (maxTime <= 0) return;
    const newTime = clampSeekTime(audio.currentTime + seconds, maxTime);
    audio.currentTime = newTime;
    set({ currentTime: newTime });
    syncMediaSessionState(get());
  },

  seekTo: (time) => {
    const audio = getAudio();
    const newTime = clampSeekTime(time, Number.isFinite(audio.duration) ? audio.duration : get().duration);
    audio.currentTime = newTime;
    set({ currentTime: newTime });
    syncMediaSessionState(get());
  },

  playNext: async () => {
    const { currentBook, bookDetail, currentSeasonIndex, currentEpisodeIndex } = get();
    if (!currentBook || !bookDetail) return;

    const season = bookDetail.seasons[currentSeasonIndex];
    if (!season) return;

    if (currentEpisodeIndex < season.episodes.length - 1) {
      await get().playEpisode(currentBook, currentSeasonIndex, currentEpisodeIndex + 1);
    } else if (currentSeasonIndex < bookDetail.seasons.length - 1) {
      await get().playEpisode(currentBook, currentSeasonIndex + 1, 0);
    } else {
      get().pause();
    }
  },

  playPrev: async () => {
    const { currentBook, bookDetail, currentSeasonIndex, currentEpisodeIndex, currentTime } = get();
    if (!currentBook || !bookDetail) return;

    if (currentTime > 5) {
      get().seekTo(0);
      return;
    }

    if (currentEpisodeIndex > 0) {
      await get().playEpisode(currentBook, currentSeasonIndex, currentEpisodeIndex - 1);
    } else if (currentSeasonIndex > 0) {
      const prevSeason = bookDetail.seasons[currentSeasonIndex - 1];
      await get().playEpisode(currentBook, currentSeasonIndex - 1, prevSeason.episodes.length - 1);
    } else {
      get().seekTo(0);
    }
  },

  saveProgress: async ({ force = false, currentTimeOverride = null } = {}) => {
    const { currentBook, currentSeasonIndex, currentEpisodeIndex, currentTime, duration, currentSeason, currentEpisode } = get();
    if (!currentBook) return;
    const progressTime = Number.isFinite(currentTimeOverride) ? currentTimeOverride : currentTime;

    const saveDecision = shouldSaveProgress({
      currentTime: progressTime,
      lastSavedSecond,
      lastSavedAt,
      force,
    });

    if (!saveDecision.shouldSave) return;
    lastSavedSecond = saveDecision.savedSecond;
    lastSavedAt = saveDecision.savedAt;

    await savePlayProgress(currentBook.id, {
      seasonIndex: currentSeasonIndex,
      episodeIndex: currentEpisodeIndex,
      seasonId: currentSeason?.id,
      episodeId: currentEpisode?.id,
      seasonName: currentSeason?.name,
      episodeName: currentEpisode?.name,
      currentTime: progressTime,
      duration,
      bookName: currentBook.name,
    });
  },

  setSleepTimer: (modeOrMinutes) => {
    clearSleepTimers();
    const now = Date.now();
    const snapshot = typeof modeOrMinutes === 'number'
      ? getSleepTimerSnapshot({ mode: 'minutes', minutes: modeOrMinutes, now })
      : getSleepTimerSnapshot({ mode: modeOrMinutes, now });

    if (!snapshot) {
      set({ sleepTimer: null, sleepTimerRemaining: null });
      return;
    }

    set({ sleepTimer: snapshot, sleepTimerRemaining: snapshot.remainingMs });

    if (snapshot.mode === 'minutes') {
      sleepTimeoutId = setTimeout(() => {
        get().pause();
        get().clearSleepTimer();
      }, snapshot.remainingMs);

      sleepIntervalId = setInterval(() => {
        const remaining = Math.max(0, snapshot.endsAt - Date.now());
        set({ sleepTimerRemaining: remaining });
      }, 1000);
    }
  },

  clearSleepTimer: () => {
    clearSleepTimers();
    set({ sleepTimer: null, sleepTimerRemaining: null });
  },

  invalidateBookDetail: async (bookId) => {
    const { currentBook, bookDetail } = get();
    if (currentBook && currentBook.id === bookId) {
      try {
        const res = await bookApi.getBook(bookId);
        const newDetail = res.data;
        set({
          bookDetail: newDetail,
          skipIntro: newDetail.skipIntro || 0,
          skipOutro: newDetail.skipOutro || 0,
        });
      } catch {
        set({ bookDetail: null });
      }
    } else if (bookDetail && bookDetail.id === bookId) {
      set({ bookDetail: null });
    }
  },

  clearPlayer: () => {
    const audio = getAudio();
    clearRetryTimer();
    clearSleepTimers();
    clearObjectUrl();
    audio.pause();
    audio.src = '';
    lastUiUpdatedAt = 0;
    lastUiSecond = -1;
    lastMediaSessionSyncedAt = 0;
    lastMediaSessionSyncedSecond = -1;
    set({
      isPlaying: false,
      currentBook: null,
      currentSeason: null,
      currentEpisode: null,
      currentSeasonIndex: 0,
      currentEpisodeIndex: 0,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      bookDetail: null,
      sleepTimer: null,
      sleepTimerRemaining: null,
      retryCount: 0,
      error: null,
    });
    syncMediaSessionState(get());
  },
}));

export default usePlayerStore;
