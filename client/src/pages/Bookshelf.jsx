import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  HiArrowPath,
  HiBarsArrowDown,
  HiBarsArrowUp,
  HiBookOpen,
  HiClock,
  HiMagnifyingGlass,
  HiPlay,
  HiXMark,
} from 'react-icons/hi2';
import useBookStore from '../stores/bookStore';
import usePlayerStore from '../stores/playerStore';
import BookCard from '../components/BookCard';
import { getAllPlayProgress, getSetting, setSetting } from '../utils/db';
import { formatDate, formatTime } from '../utils/format';

const BOOK_ENTRANCE_ANIMATION_LIMIT = 36;

// 排序模式：recent(最近播放), nameAsc(名称正序), nameDesc(名称倒序)
const SORT_MODES = [
  { key: 'recent', label: '最近播放' },
  { key: 'nameAsc', label: '名称 A→Z' },
  { key: 'nameDesc', label: '名称 Z→A' },
];

export default function Bookshelf() {
  const navigate = useNavigate();
  const { books, isLoading, error, searchQuery, setSearchQuery, fetchBooks, getFilteredBooks } = useBookStore();
  const { initPlayer, resumeBook } = usePlayerStore();
  const [progressMap, setProgressMap] = useState({});
  const [showSearch, setShowSearch] = useState(false);
  const [sortMode, setSortMode] = useState('recent');

  useEffect(() => {
    initPlayer();
    fetchBooks();
    loadProgress();
    loadSortMode();
  }, []);

  const loadSortMode = async () => {
    const mode = await getSetting('bookSortMode', 'recent');
    setSortMode(mode);
  };

  const cycleSortMode = async () => {
    const idx = SORT_MODES.findIndex(m => m.key === sortMode);
    const next = SORT_MODES[(idx + 1) % SORT_MODES.length];
    setSortMode(next.key);
    await setSetting('bookSortMode', next.key);
  };

  const loadProgress = async () => {
    const allProgress = await getAllPlayProgress();
    const map = {};
    for (const p of allProgress) {
      map[p.bookId] = p;
    }
    setProgressMap(map);
  };

  const filteredBooks = getFilteredBooks();
  const currentSortLabel = SORT_MODES.find(m => m.key === sortMode)?.label;
  const recentListening = books
    .map(book => ({ book, progress: progressMap[book.id] }))
    .filter(item => item.progress)
    .sort((a, b) => (b.progress.updatedAt || 0) - (a.progress.updatedAt || 0))[0];
  const recentCurrentTime = Math.max(0, Number(recentListening?.progress?.currentTime) || 0);
  const recentDuration = Number(recentListening?.progress?.duration) || 0;
  const recentProgressPercent = recentDuration > 0
    ? Math.min(100, Math.max(0, (recentCurrentTime / recentDuration) * 100))
    : recentCurrentTime > 0 ? 14 : 6;
  const recentEpisodeTitle = recentListening
    ? `${recentListening.progress.seasonName ? `${recentListening.progress.seasonName} · ` : ''}${recentListening.progress.episodeName || `第${(Number(recentListening.progress.episodeIndex) || 0) + 1}集`}`
    : '';

  const handleResumeRecent = async () => {
    if (!recentListening) return;
    await resumeBook(recentListening.book);
    navigate('/player');
  };

  // 排序
  const sortedBooks = [...filteredBooks].sort((a, b) => {
    if (sortMode === 'nameAsc') {
      return a.name.localeCompare(b.name, 'zh-CN');
    }
    if (sortMode === 'nameDesc') {
      return b.name.localeCompare(a.name, 'zh-CN');
    }
    // 默认：最近播放排在前面
    const pa = progressMap[a.id];
    const pb = progressMap[b.id];
    if (pa && pb) return (pb.updatedAt || 0) - (pa.updatedAt || 0);
    if (pa) return -1;
    if (pb) return 1;
    return 0;
  });
  const disableBookEntranceAnimation = sortedBooks.length > BOOK_ENTRANCE_ANIMATION_LIMIT;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="page-container"
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">书架</h1>
          <p className="text-sm text-dark-400 mt-1">
            共 {books.length} 本有声书
            <span className="text-dark-500 ml-2 text-xs">
              · {currentSortLabel}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={cycleSortMode}
            className="btn-ghost relative"
            title={`排序: ${currentSortLabel}`}
            aria-label={`切换排序方式，当前为${currentSortLabel}`}
          >
            {sortMode === 'nameDesc' ? (
              <HiBarsArrowUp className="w-5 h-5" />
            ) : (
              <HiBarsArrowDown className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={() => { fetchBooks(); loadProgress(); }}
            className="btn-ghost"
            title="刷新书库"
            aria-label="刷新书库"
          >
            <HiArrowPath className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="btn-ghost"
            aria-label={showSearch ? '关闭搜索' : '打开搜索'}
          >
            {showSearch ? <HiXMark className="w-6 h-6" /> : <HiMagnifyingGlass className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      {showSearch && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="mb-4"
        >
          <div className="relative">
            <HiMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索有声书..."
              autoFocus
              className="field-ios pl-12 pr-4"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400"
                aria-label="清空搜索内容"
              >
                <HiXMark className="w-5 h-5" />
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-dark-600 border-t-primary-500 rounded-full animate-spin" />
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="text-center py-20">
          <p className="text-dark-400 mb-4">{error}</p>
          <button onClick={fetchBooks} className="btn-primary text-sm">
            重试
          </button>
        </div>
      )}

      {/* 继续收听 */}
      {!isLoading && !error && recentListening && (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="mb-5 overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.14] via-white/[0.07] to-primary-500/10 p-4 shadow-2xl shadow-black/20"
          aria-label="继续收听"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary-300">继续收听</p>
              <h2 className="mt-2 line-clamp-2 text-xl font-bold leading-tight text-white">
                {recentListening.book.name}
              </h2>
              <p className="mt-2 truncate text-sm text-dark-300">{recentEpisodeTitle}</p>
            </div>
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 text-primary-200">
              <HiBookOpen className="h-6 w-6" aria-hidden="true" />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-label="当前章节收听进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(recentProgressPercent)}
            >
              <div
                className="h-full rounded-full bg-primary-400 transition-all duration-500"
                style={{ width: `${recentProgressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-dark-400">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <HiClock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{formatDate(recentListening.progress.updatedAt)}</span>
              </span>
              <span className="font-medium text-dark-300">{formatTime(recentCurrentTime)}</span>
            </div>
          </div>

          <button
            onClick={handleResumeRecent}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary-500 text-sm font-semibold text-[rgb(var(--color-primary-contrast))] shadow-lg shadow-primary-500/20 transition-all duration-200 active:scale-[0.98]"
            aria-label={`继续收听${recentListening.book.name}`}
          >
            <HiPlay className="h-5 w-5" aria-hidden="true" />
            继续播放
          </button>
        </motion.section>
      )}

      {/* 空状态 */}
      {!isLoading && !error && sortedBooks.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.06] text-dark-300 shadow-lg shadow-black/10">
            <HiBookOpen className="h-10 w-10" aria-hidden="true" />
          </div>
          <p className="text-lg font-semibold text-white mb-2">
            {searchQuery ? '没有找到匹配的有声书' : '书架空空如也'}
          </p>
          <p className="max-w-[260px] text-sm leading-6 text-dark-500">
            {searchQuery ? '试试其他关键词' : '请在服务器的有声书目录中添加音频文件'}
          </p>
        </div>
      )}

      {/* 书籍列表 */}
      <div className="bookshelf-list space-y-3">
        {sortedBooks.map((book, index) => (
          <BookCard
            key={book.id}
            book={book}
            progress={progressMap[book.id]}
            index={index}
            disableEntranceAnimation={disableBookEntranceAnimation}
          />
        ))}
      </div>
    </motion.div>
  );
}
