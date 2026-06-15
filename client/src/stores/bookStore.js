/**
 * 书籍状态管理
 */
import { create } from 'zustand';
import { bookApi } from '../utils/api';
import { getAllFavorites, addFavorite, removeFavorite, isFavorite } from '../utils/db';

const useBookStore = create((set, get) => ({
  books: [],
  favorites: [],
  isLoading: false,
  error: null,
  searchQuery: '',

  // 获取书籍列表
  fetchBooks: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await bookApi.getBooks();
      set({ books: res.data, isLoading: false });
    } catch (e) {
      console.error('Failed to fetch books:', e);
      set({ error: '加载书籍列表失败', isLoading: false });
    }
  },

  // 搜索书籍
  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  // 获取过滤后的书籍
  getFilteredBooks: () => {
    const { books, searchQuery } = get();
    if (!searchQuery.trim()) return books;
    const q = searchQuery.toLowerCase();
    return books.filter(b => 
      b.name.toLowerCase().includes(q) || 
      b.folderName.toLowerCase().includes(q)
    );
  },

  // 加载收藏列表
  loadFavorites: async () => {
    try {
      const favorites = await getAllFavorites();
      set({ favorites });
    } catch (e) {
      console.error('Failed to load favorites:', e);
    }
  },

  // 切换收藏
  toggleFavorite: async (book) => {
    try {
      const fav = await isFavorite(book.id);
      if (fav) {
        await removeFavorite(book.id);
      } else {
        await addFavorite(book.id, {
          name: book.name,
          folderName: book.folderName,
          hasCover: book.hasCover,
          seasonCount: book.seasonCount,
          totalEpisodes: book.totalEpisodes,
        });
      }
      // 刷新收藏列表
      await get().loadFavorites();
    } catch (e) {
      console.error('Failed to toggle favorite:', e);
    }
  },

  // 检查是否已收藏
  checkFavorite: async (bookId) => {
    return await isFavorite(bookId);
  },
}));

export default useBookStore;
