import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { 
  HiChevronDown, 
  HiPlay, HiPause,
  HiBackward, HiForward,
  HiArrowUturnLeft, HiArrowUturnRight,
  HiQueueList,
  HiHeart, HiOutlineHeart,
  HiMoon,
  HiXMark,
  HiExclamationTriangle,
} from 'react-icons/hi2';
import usePlayerStore from '../stores/playerStore';
import useBookStore from '../stores/bookStore';
import { bookApi } from '../utils/api';
import { formatTime } from '../utils/format';
import { useState, useEffect, useRef } from 'react';

const SKIP_SECONDS = 15;
const SLEEP_TIMER_OPTIONS = [
  { label: '15 分钟', minutes: 15 },
  { label: '30 分钟', minutes: 30 },
  { label: '45 分钟', minutes: 45 },
  { label: '60 分钟', minutes: 60 },
];
const SPEED_OPTIONS = [0.8, 1, 1.25, 1.5, 2];
const EPISODE_WINDOW_SIZE = 80;

const getErrorMessage = (error) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return error.message || error.msg || '播放出错，请稍后重试';
};

const normalizeRemainingSeconds = (remaining) => {
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return 0;
  return Math.max(0, Math.floor(remaining / 1000));
};

export default function Player() {
  const navigate = useNavigate();
  const {
    currentBook, currentSeason, currentEpisode,
    currentSeasonIndex, currentEpisodeIndex,
    isPlaying, currentTime, duration, isLoading, bookDetail,
    playbackRate, setPlaybackRate, networkStatus,
    togglePlay, seekTo, seekRelative, playNext, playPrev,
    playEpisode,
    sleepTimer, sleepTimerRemaining, setSleepTimer, clearSleepTimer,
    error, retryCount, retryCurrentEpisode,
  } = usePlayerStore();
  
  const { checkFavorite, toggleFavorite } = useBookStore();
  const [isFav, setIsFav] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [playlistSeasonIndex, setPlaylistSeasonIndex] = useState(0);
  const [episodeWindowStart, setEpisodeWindowStart] = useState(0);
  const [isPageVisible, setIsPageVisible] = useState(() => (
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  ));
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const progressRef = useRef(null);
  const currentEpisodeRef = useRef(null);
  const shouldReduceMotion = useReducedMotion();
  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;
  const shouldSpinCover = isPlaying && isPageVisible && !shouldReduceMotion && !isTouchDevice;

  useEffect(() => {
    if (currentBook) {
      checkFavorite(currentBook.id).then(setIsFav);
    }
  }, [currentBook]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!showEpisodes) return;
    const timer = window.setTimeout(() => {
      currentEpisodeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [showEpisodes, currentEpisode?.id]);

  useEffect(() => {
    if (!showEpisodes) return;
    const safeSeasonIndex = Math.max(0, currentSeasonIndex || 0);
    setPlaylistSeasonIndex(safeSeasonIndex);
    setEpisodeWindowStart(Math.max(0, (currentEpisodeIndex || 0) - Math.floor(EPISODE_WINDOW_SIZE / 2)));
  }, [showEpisodes, currentSeasonIndex, currentEpisodeIndex]);

  if (!currentBook || !currentEpisode) {
    return (
      <div className="page-container flex flex-col items-center justify-center">
        <div className="text-6xl mb-4">🎧</div>
        <p className="text-dark-400 text-lg">暂无播放内容</p>
        <button 
          onClick={() => navigate('/')} 
          className="btn-primary mt-6"
        >
          去书架选择
        </button>
      </div>
    );
  }

  const handleToggleFav = async () => {
    if (currentBook) {
      await toggleFavorite(currentBook);
      setIsFav(!isFav);
    }
  };

  const displayTime = isDragging ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const sleepRemainingSeconds = normalizeRemainingSeconds(sleepTimerRemaining);
  const hasSleepTimer = Boolean(sleepTimer) || sleepRemainingSeconds > 0;
  const sleepTimerLabel = sleepTimer?.mode === 'episode'
    ? '播完本集'
    : formatTime(sleepRemainingSeconds);
  const canSetSleepTimer = typeof setSleepTimer === 'function';
  const canClearSleepTimer = typeof clearSleepTimer === 'function';
  const playerErrorMessage = getErrorMessage(error);
  const hasRetryState = Number(retryCount) > 0;
  const showNetworkHint = networkStatus === 'offline' || networkStatus === 'retrying';
  const seasons = bookDetail?.seasons || [];
  const hasMultipleSeasons = seasons.length > 1;
  const sheetMotion = shouldReduceMotion
    ? { initial: false, animate: { y: 0 }, exit: undefined, transition: { duration: 0 } }
    : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: { duration: 0.2, ease: 'easeOut' } };

  // 拖拽进度条
  const getProgressTimeFromClientX = (clientX) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    return percentage * duration;
  };

  const getProgressTimeFromEvent = (e) => {
    const clientX = e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;
    return typeof clientX === 'number' ? getProgressTimeFromClientX(clientX) : undefined;
  };

  const updateDragTimeFromEvent = (e) => {
    const time = getProgressTimeFromEvent(e);
    if (time !== undefined) setDragTime(time);
    return time;
  };

  const isPointerEventSupported = () => typeof window !== 'undefined' && 'PointerEvent' in window;

  const onProgressPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    updateDragTimeFromEvent(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onProgressPointerMove = (e) => {
    if (!isDragging) return;
    updateDragTimeFromEvent(e);
  };

  const onProgressPointerUp = (e) => {
    if (!isDragging) return;
    const time = getProgressTimeFromEvent(e);
    const finalTime = time ?? dragTime;
    seekTo(finalTime);
    setDragTime(finalTime);
    setIsDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onProgressPointerCancel = (e) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onProgressFallbackStart = (e) => {
    if (isPointerEventSupported()) return;
    setIsDragging(true);
    updateDragTimeFromEvent(e);
  };

  const onProgressFallbackMove = (e) => {
    if (isPointerEventSupported() || !isDragging) return;
    updateDragTimeFromEvent(e);
  };

  const onProgressFallbackEnd = (e) => {
    if (isPointerEventSupported() || !isDragging) return;
    const time = getProgressTimeFromEvent(e);
    const finalTime = time ?? dragTime;
    seekTo(finalTime);
    setDragTime(finalTime);
    setIsDragging(false);
  };

  const handleProgressKeyDown = (e) => {
    if (!duration) return;
    let nextTime;
    if (e.key === 'ArrowLeft') {
      nextTime = Math.max(0, displayTime - SKIP_SECONDS);
    } else if (e.key === 'ArrowRight') {
      nextTime = Math.min(duration, displayTime + SKIP_SECONDS);
    } else if (e.key === 'Home') {
      nextTime = 0;
    } else if (e.key === 'End') {
      nextTime = duration;
    } else {
      return;
    }
    e.preventDefault();
    seekTo(nextTime);
    setDragTime(nextTime);
  };

  const handlePlayerDoubleClick = (e) => {
    if (e.target.closest('button, a, input, textarea, select, [role="slider"]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeftSide = e.clientX - rect.left < rect.width / 2;
    seekRelative(isLeftSide ? -SKIP_SECONDS : SKIP_SECONDS);
  };

  const handleSetSleepTimer = (minutes) => {
    if (!canSetSleepTimer) return;
    setSleepTimer(minutes);
    setShowSleepTimer(false);
  };

  const handleClearSleepTimer = () => {
    if (!canClearSleepTimer) return;
    clearSleepTimer();
    setShowSleepTimer(false);
  };

  const handleRetry = () => {
    if (typeof retryCurrentEpisode === 'function') {
      retryCurrentEpisode();
    }
  };

  // 集列表选择
  const handleSelectEpisode = (sIndex, eIndex) => {
    playEpisode(currentBook, sIndex, eIndex);
    setShowEpisodes(false);
  };

  const playlistSeason = bookDetail?.seasons?.[playlistSeasonIndex];
  const playlistEpisodes = playlistSeason?.episodes || [];
  const normalizedWindowStart = Math.min(
    Math.max(0, episodeWindowStart),
    Math.max(0, playlistEpisodes.length - EPISODE_WINDOW_SIZE),
  );
  const visibleEpisodes = playlistEpisodes.slice(normalizedWindowStart, normalizedWindowStart + EPISODE_WINDOW_SIZE);
  const canShowEarlierEpisodes = normalizedWindowStart > 0;
  const canShowLaterEpisodes = normalizedWindowStart + EPISODE_WINDOW_SIZE < playlistEpisodes.length;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={shouldReduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden"
      style={{ background: 'var(--app-bg)' }}
    >
      {/* 背景模糊封面 */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={bookApi.getCoverUrl(currentBook.id)}
          alt=""
          className="player-bg-art hidden w-full h-full object-cover opacity-10 blur-3xl scale-110 sm:block"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-dark-950/40 via-dark-950/70 to-dark-950" />
      </div>

      {/* 内容区 */}
      <div
        className="app-shell relative flex h-full min-h-dvh flex-col mx-auto w-full pt-safe pb-safe"
        onDoubleClick={handlePlayerDoubleClick}
      >
        {/* 顶部栏 */}
        <div className="player-topbar flex items-center justify-between px-5 pb-1">
          <button 
            onClick={() => navigate(-1)} 
            className="btn-ghost touch-target p-2"
            aria-label="收起播放器"
          >
            <HiChevronDown className="w-7 h-7" />
          </button>
          <div className="min-w-0 flex-1 px-3 text-center">
            <p className="truncate text-[13px] font-medium leading-5 text-dark-300">{currentBook.name}</p>
          </div>
          <button
            onClick={handleToggleFav}
            className="btn-ghost touch-target p-2"
            aria-label={isFav ? '取消收藏' : '收藏'}
          >
            {isFav ? (
              <HiHeart className="w-6 h-6 text-red-500" />
            ) : (
              <HiOutlineHeart className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* 封面区域 */}
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-2">
          <motion.div
            animate={{ rotate: shouldSpinCover ? 360 : 0 }}
            transition={{
              duration: 20,
              repeat: shouldSpinCover ? Infinity : 0,
              ease: 'linear',
            }}
            className="player-cover-disc rounded-full overflow-hidden shadow-2xl shadow-black/50 border-4 border-dark-700/30"
          >
            <img
              src={bookApi.getCoverUrl(currentBook.id)}
              alt={currentBook.name}
              className="w-full h-full object-cover"
            />
          </motion.div>
        </div>

        {/* 集信息 */}
        <div className="px-6 mb-3">
          <h2 className="text-lg font-bold text-white truncate">
            {currentEpisode.name}
          </h2>
          <p className="text-sm text-dark-400 mt-1 truncate">
            {currentBook.name}
            {bookDetail && bookDetail.seasons.length > 1 && ` · ${currentSeason?.name}`}
          </p>
          {bookDetail && (
            <p className="text-xs text-dark-500 mt-1">
              第 {currentEpisodeIndex + 1} / {currentSeason?.episodes?.length || 0} 集
              {bookDetail.seasons.length > 1 && ` · 第 ${currentSeasonIndex + 1} / ${bookDetail.seasons.length} 季`}
            </p>
          )}
        </div>

        {(playerErrorMessage || hasRetryState) && (
          <div className="px-6 mb-3" role="status" aria-live="polite">
            <div className="flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-amber-100">
              <HiExclamationTriangle className="h-5 w-5 flex-shrink-0 text-amber-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {playerErrorMessage || '正在尝试恢复播放'}
                </p>
                {hasRetryState && (
                  <p className="mt-0.5 text-xs text-amber-200/80">
                    已重试 {retryCount} 次
                  </p>
                )}
              </div>
              {typeof retryCurrentEpisode === 'function' && (
                <button
                  onClick={handleRetry}
                  className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-dark-950 transition-colors hover:bg-amber-200"
                >
                  重试
                </button>
              )}
            </div>
          </div>
        )}

        {hasSleepTimer && (
          <div className="px-6 mb-3" role="status" aria-live="polite">
            <button
              onClick={() => setShowSleepTimer(true)}
              className="flex w-full items-center justify-between rounded-2xl border border-primary-500/20 bg-primary-500/10 px-4 py-3 text-left text-primary-100 transition-colors active:scale-[0.99]"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <HiMoon className="h-5 w-5" />
                睡眠定时已开启
              </span>
              <span className="text-sm tabular-nums text-primary-200">{sleepTimerLabel}</span>
            </button>
          </div>
        )}

        {showNetworkHint && (
          <div className="px-6 mb-3" role="status" aria-live="polite">
            <div className="rounded-2xl bg-dark-800/70 px-4 py-3 text-sm text-dark-300">
              {networkStatus === 'offline'
                ? '当前处于离线状态，已缓存章节可继续播放。'
                : '网络不稳定，播放器正在自动重试。'}
            </div>
          </div>
        )}

        {/* 进度条 */}
        <div className="px-6 mb-3">
          <div 
            ref={progressRef}
            className="relative h-8 flex items-center cursor-pointer"
            role="slider"
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration || 0)}
            aria-valuenow={Math.round(displayTime || 0)}
            tabIndex={0}
            style={{ touchAction: 'none' }}
            onKeyDown={handleProgressKeyDown}
            onPointerDown={onProgressPointerDown}
            onPointerMove={onProgressPointerMove}
            onPointerUp={onProgressPointerUp}
            onPointerCancel={onProgressPointerCancel}
            onTouchStart={onProgressFallbackStart}
            onTouchMove={onProgressFallbackMove}
            onTouchEnd={onProgressFallbackEnd}
            onMouseDown={onProgressFallbackStart}
            onMouseMove={onProgressFallbackMove}
            onMouseUp={onProgressFallbackEnd}
            onMouseLeave={onProgressFallbackEnd}
          >
            {/* 轨道 */}
            <div className="w-full h-1 bg-dark-700 rounded-full relative">
              {/* 已播放 */}
              <div 
                className="absolute left-0 top-0 h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${progress}%`, transition: isDragging ? 'none' : 'width 0.3s' }}
              />
              {/* 拖拽指示器 */}
              <div 
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary-500 shadow-lg shadow-primary-500/30 transition-all ${isDragging ? 'scale-150' : ''}`}
                style={{ left: `calc(${progress}% - 8px)`, transition: isDragging ? 'none' : 'left 0.3s' }}
              />
            </div>
          </div>
          <div className="flex justify-between text-xs text-dark-500 -mt-1">
            <span>{formatTime(displayTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 播放控制 */}
        <div className="px-5 mb-5">
          <div className="flex items-center justify-between">
            {/* 快退15s */}
            <button
              onClick={() => seekRelative(-SKIP_SECONDS)}
              className="relative btn-ghost touch-target p-3 group"
              aria-label="快退 15 秒"
            >
              <HiArrowUturnLeft className="w-6 h-6 group-active:scale-90 transition-transform" />
              <span className="absolute top-1 right-1 text-[8px] text-dark-400 font-bold">15</span>
            </button>
            
            {/* 上一集 */}
            <button 
              onClick={playPrev} 
              className="btn-ghost touch-target p-3"
              aria-label="上一集"
            >
              <HiBackward className="w-8 h-8" />
            </button>
            
            {/* 播放/暂停 */}
            <button 
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-primary-500 text-[rgb(var(--color-primary-contrast))] flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-primary-500/30"
              aria-label={isPlaying ? '暂停' : '播放'}
            >
              {isLoading ? (
                <div className="w-8 h-8 border-3 border-current/30 border-t-current rounded-full animate-spin" />
              ) : isPlaying ? (
                <HiPause className="w-8 h-8" />
              ) : (
                <HiPlay className="w-8 h-8 ml-1" />
              )}
            </button>
            
            {/* 下一集 */}
            <button 
              onClick={playNext} 
              className="btn-ghost touch-target p-3"
              aria-label="下一集"
            >
              <HiForward className="w-8 h-8" />
            </button>
            
            {/* 快进15s */}
            <button
              onClick={() => seekRelative(SKIP_SECONDS)}
              className="relative btn-ghost touch-target p-3 group"
              aria-label="快进 15 秒"
            >
              <HiArrowUturnRight className="w-6 h-6 group-active:scale-90 transition-transform" />
              <span className="absolute top-1 right-1 text-[8px] text-dark-400 font-bold">15</span>
            </button>
          </div>
        </div>

        {/* 倍速 */}
        <div className="px-6 mb-4">
          <div className="segmented-control grid-cols-5" role="group" aria-label="播放倍速">
            {SPEED_OPTIONS.map((rate) => {
              const isActive = Number(playbackRate || 1) === rate;
              return (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setPlaybackRate?.(rate)}
                  className={`segmented-option ${isActive ? 'segmented-option-active' : 'segmented-option-idle'}`}
                  aria-pressed={isActive}
                >
                  {rate === 1 ? '1x' : `${rate}x`}
                </button>
              );
            })}
          </div>
        </div>

        {/* 集列表按钮 */}
        <div className="grid grid-cols-2 gap-3 px-6 pb-2">
          <button
            onClick={() => {
              setShowEpisodes(false);
              setShowSleepTimer(true);
            }}
            className="touch-target flex items-center justify-center gap-2 rounded-2xl text-dark-400 transition-colors hover:text-white"
            aria-label={hasSleepTimer ? `睡眠定时：${sleepTimerLabel}` : '设置睡眠定时'}
          >
            <HiMoon className="w-5 h-5" />
            <span className="text-sm">
              {hasSleepTimer ? sleepTimerLabel : '睡眠定时'}
            </span>
          </button>
          <button
            onClick={() => {
              setShowSleepTimer(false);
              setShowEpisodes(!showEpisodes);
            }}
            className="touch-target flex items-center justify-center gap-2 text-dark-400 hover:text-white rounded-2xl transition-colors"
            aria-label="打开播放列表"
          >
            <HiQueueList className="w-5 h-5" />
            <span className="text-sm">播放列表</span>
          </button>
        </div>
      </div>

      {/* 睡眠定时器面板 */}
      {showSleepTimer && (
        <motion.div
          {...sheetMotion}
          className="ios-bottom-sheet fixed bottom-0 left-0 right-0 z-[60] rounded-t-3xl overflow-hidden"
          style={{ background: 'var(--surface-card-strong)' }}
        >
          <div className="app-shell-width">
            <div
              className="sticky top-0 flex items-center justify-between border-b p-4 backdrop-blur-xl"
              style={{ background: 'var(--surface-card-strong)', borderColor: 'var(--border-soft)' }}
            >
              <div>
                <h3 className="font-semibold">睡眠定时</h3>
                <p className="mt-0.5 text-xs text-dark-500">
                  到点后自动停止播放
                </p>
              </div>
              <button
                onClick={() => setShowSleepTimer(false)}
                className="btn-ghost touch-target p-2"
                aria-label="关闭睡眠定时面板"
              >
                <HiXMark className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-4 pb-safe">
              {hasSleepTimer && (
                <div className="rounded-2xl bg-primary-500/10 px-4 py-3 text-primary-200">
                  <p className="text-sm text-primary-100">定时器已开启</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {sleepTimerLabel}
                  </p>
                </div>
              )}
              {!canSetSleepTimer && (
                <div className="rounded-2xl bg-dark-800/70 px-4 py-3 text-sm text-dark-300">
                  睡眠定时功能正在接入中，播放器会在主线程提供接口后自动启用。
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {SLEEP_TIMER_OPTIONS.map((option) => (
                  <button
                    key={option.minutes}
                    onClick={() => handleSetSleepTimer(option.minutes)}
                    disabled={!canSetSleepTimer}
                    className="touch-target rounded-2xl bg-dark-800 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  onClick={() => handleSetSleepTimer('episode')}
                  disabled={!canSetSleepTimer}
                  className="touch-target col-span-2 rounded-2xl bg-dark-800 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  播完本集停止
                </button>
              </div>
              <button
                onClick={handleClearSleepTimer}
                disabled={!canClearSleepTimer || !hasSleepTimer}
                className="touch-target w-full rounded-2xl border border-dark-700 px-4 py-3 text-sm text-dark-300 transition-colors hover:border-dark-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                关闭定时器
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* 集列表面板 */}
      {showEpisodes && (
        <motion.div
          {...sheetMotion}
          className="ios-bottom-sheet fixed bottom-0 left-0 right-0 z-[60] rounded-t-3xl overflow-hidden"
          style={{ background: 'var(--surface-card-strong)' }}
        >
          <div className="app-shell-width">
            <div
              className="sticky top-0 p-4 border-b flex items-center justify-between backdrop-blur-xl"
              style={{ background: 'var(--surface-card-strong)', borderColor: 'var(--border-soft)' }}
            >
              <h3 className="font-semibold">播放列表</h3>
              <button onClick={() => setShowEpisodes(false)} className="touch-target text-dark-400 text-sm">
                关闭
              </button>
            </div>
            <div className="ios-bottom-sheet-scroll overflow-y-auto">
              {hasMultipleSeasons && (
                <div className="grid grid-cols-2 gap-2 border-b border-white/5 p-3 sm:grid-cols-3">
                  {seasons.map((season, sIndex) => {
                    const isActiveSeason = sIndex === playlistSeasonIndex;
                    return (
                      <button
                        key={season.id}
                        onClick={() => {
                          if (!isActiveSeason) {
                            setPlaylistSeasonIndex(sIndex);
                            setEpisodeWindowStart(0);
                          }
                        }}
                        className={`min-h-10 rounded-2xl px-3 text-left text-xs transition-colors ${
                          isActiveSeason
                            ? 'bg-primary-500/15 text-primary-300'
                            : 'bg-dark-800/70 text-dark-400 hover:text-white'
                        }`}
                        aria-pressed={isActiveSeason}
                      >
                        <span className="block truncate font-medium">{season.name}</span>
                        <span className="mt-0.5 block text-[10px] opacity-70">{season.episodes?.length || 0} 集</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {playlistSeason && hasMultipleSeasons && (
                <div className="sticky top-0 bg-dark-800/90 px-4 py-2 text-xs font-medium text-dark-400">
                  {playlistSeason.name}
                </div>
              )}

              {canShowEarlierEpisodes && (
                <button
                  type="button"
                  onClick={() => setEpisodeWindowStart(Math.max(0, normalizedWindowStart - EPISODE_WINDOW_SIZE))}
                  className="w-full px-4 py-2 text-center text-xs text-dark-500 transition-colors hover:text-dark-300"
                >
                  显示前 {Math.min(EPISODE_WINDOW_SIZE, normalizedWindowStart)} 集
                </button>
              )}

              {visibleEpisodes.map((ep, offset) => {
                const eIndex = normalizedWindowStart + offset;
                const isCurrent = playlistSeasonIndex === currentSeasonIndex && currentEpisode?.id === ep.id;
                return (
                  <button
                    key={ep.id}
                    ref={isCurrent ? currentEpisodeRef : null}
                    onClick={() => handleSelectEpisode(playlistSeasonIndex, eIndex)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                      isCurrent ? 'bg-primary-500/10 text-primary-500' : 'text-dark-300 hover:bg-dark-800'
                    }`}
                  >
                    <span className={`text-xs w-8 text-center ${isCurrent ? 'text-primary-500' : 'text-dark-500'}`}>
                      {eIndex + 1}
                    </span>
                    <span className="flex-1 truncate text-sm">{ep.name}</span>
                    {isCurrent && isPlaying && (
                      <div className="player-now-bars flex gap-0.5 items-end h-4" aria-hidden="true">
                        <div className="w-0.5 bg-primary-500 animate-pulse" style={{ height: '40%' }} />
                        <div className="w-0.5 bg-primary-500 animate-pulse" style={{ height: '80%', animationDelay: '0.1s' }} />
                        <div className="w-0.5 bg-primary-500 animate-pulse" style={{ height: '60%', animationDelay: '0.2s' }} />
                      </div>
                    )}
                  </button>
                );
              })}

              {canShowLaterEpisodes && (
                <button
                  type="button"
                  onClick={() => setEpisodeWindowStart(normalizedWindowStart + EPISODE_WINDOW_SIZE)}
                  className="w-full px-4 py-2 text-center text-xs text-dark-500 transition-colors hover:text-dark-300"
                >
                  显示后 {Math.min(EPISODE_WINDOW_SIZE, playlistEpisodes.length - normalizedWindowStart - EPISODE_WINDOW_SIZE)} 集
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
