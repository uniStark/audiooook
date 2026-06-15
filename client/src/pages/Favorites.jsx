import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import useBookStore from '../stores/bookStore';
import BookCard from '../components/BookCard';
import { getAllPlayProgress } from '../utils/db';

export default function Favorites() {
  const { favorites, loadFavorites } = useBookStore();
  const [progressMap, setProgressMap] = useState({});

  useEffect(() => {
    loadFavorites();
    loadProgress();
  }, []);

  const loadProgress = async () => {
    const allProgress = await getAllPlayProgress();
    const map = {};
    for (const p of allProgress) {
      map[p.bookId] = p;
    }
    setProgressMap(map);
  };

  // 将收藏转为BookCard需要的格式
  const favBooks = favorites.map(f => ({
    id: f.bookId,
    name: f.name,
    folderName: f.folderName,
    hasCover: f.hasCover,
    seasonCount: f.seasonCount,
    totalEpisodes: f.totalEpisodes,
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="page-container"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">收藏</h1>
        <p className="text-sm text-dark-400 mt-1">
          {favorites.length} 本收藏
        </p>
      </div>

      {favorites.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">💝</div>
          <p className="text-dark-400 text-lg">还没有收藏</p>
          <p className="text-dark-500 text-sm mt-2">
            在书籍详情页点击爱心即可收藏
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {favBooks.map((book, index) => (
            <BookCard
              key={book.id}
              book={book}
              progress={progressMap[book.id]}
              index={index}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
