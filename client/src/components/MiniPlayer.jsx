import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HiPlay, HiPause, HiForward } from 'react-icons/hi2';
import usePlayerStore from '../stores/playerStore';
import { bookApi } from '../utils/api';
import { formatTime } from '../utils/format';

export default function MiniPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    currentBook, currentEpisode, currentSeason,
    isPlaying, currentTime, duration, isLoading,
    togglePlay, playNext 
  } = usePlayerStore();

  // 不在播放器页面且有正在播放的内容时显示
  if (!currentBook || location.pathname === '/player') return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        exit={{ y: 80 }}
        className="fixed mini-player-offset left-0 right-0 z-30 px-2"
      >
        <div className="mobile-fixed-shell">
          <div
            className="backdrop-blur-xl border rounded-3xl overflow-hidden"
            style={{
              background: 'var(--surface-card-strong)',
              borderColor: 'var(--border-soft)',
              boxShadow: 'var(--shadow-floating)',
            }}
            onClick={() => navigate('/player')}
          >
            {/* 进度条 */}
            <div className="h-0.5 bg-dark-700">
              <div 
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <div className="flex min-h-[72px] items-center gap-3 p-3">
              {/* 封面 */}
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-dark-700">
                <img
                  src={bookApi.getCoverUrl(currentBook.id)}
                  alt=""
                  className={`w-full h-full object-cover ${isPlaying ? 'animate-pulse-soft' : ''}`}
                />
              </div>
              
              {/* 信息 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {currentEpisode?.name || '未知'}
                </p>
                <p className="text-xs text-dark-400 truncate mt-0.5">
                  {currentBook.name}
                  {currentSeason && ` · ${currentSeason.name}`}
                </p>
              </div>
              
              {/* 控制按钮 */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={togglePlay}
                  className="touch-target flex items-center justify-center rounded-full bg-primary-500 text-[rgb(var(--color-primary-contrast))] active:scale-90 transition-transform"
                  aria-label={isPlaying ? '暂停' : '播放'}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <HiPause className="w-5 h-5" />
                  ) : (
                    <HiPlay className="w-5 h-5 ml-0.5" />
                  )}
                </button>
                <button
                  onClick={playNext}
                  className="touch-target flex items-center justify-center text-dark-300 active:scale-90 transition-transform"
                  aria-label="下一集"
                >
                  <HiForward className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
