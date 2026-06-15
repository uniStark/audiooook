import { create } from 'zustand';
import { sessionApi } from '../utils/api';
import { setCurrentUsername, syncFromServer } from '../utils/db';
import useBookStore from './bookStore';
import usePlayerStore from './playerStore';

const useSessionStore = create((set, get) => ({
  currentUser: null,
  users: [],
  isReady: false,
  isBusy: false,
  error: '',
  sessionVersion: 0,

  loadSession: async () => {
    try {
      const res = await sessionApi.getSession();
      const currentUser = res.currentUser || null;
      setCurrentUsername(currentUser?.username || null);
      set({
        currentUser,
        users: res.users || [],
        isReady: true,
        error: '',
      });
      if (currentUser) {
        await syncFromServer(currentUser.username);
        await useBookStore.getState().fetchBooks();
        await useBookStore.getState().loadFavorites();
      }
    } catch (e) {
      set({ isReady: true, error: e.message || '加载用户失败' });
    }
  },

  login: async (username, password, { create = false } = {}) => {
    set({ isBusy: true, error: '' });
    try {
      const player = usePlayerStore.getState();
      await player.saveProgress?.({ force: true });
      player.clearPlayer?.();

      const res = create
        ? await sessionApi.createUser(username, password)
        : await sessionApi.login(username, password);
      const currentUser = res.currentUser || null;
      setCurrentUsername(currentUser?.username || null);
      set({
        currentUser,
        users: res.users || [],
        isBusy: false,
        isReady: true,
        error: '',
        sessionVersion: get().sessionVersion + 1,
      });
      if (currentUser) {
        await syncFromServer(currentUser.username);
        await useBookStore.getState().fetchBooks();
        await useBookStore.getState().loadFavorites();
      }
      return true;
    } catch (e) {
      set({ isBusy: false, error: e.message || '登录失败' });
      return false;
    }
  },

  switchUser: async (username, password) => {
    set({ isBusy: true, error: '' });
    try {
      const player = usePlayerStore.getState();
      await player.saveProgress?.({ force: true });
      player.clearPlayer?.();

      const res = await sessionApi.switchUser(username, password);
      const currentUser = res.currentUser || null;
      setCurrentUsername(currentUser?.username || null);
      set({
        currentUser,
        users: res.users || [],
        isBusy: false,
        error: '',
        sessionVersion: get().sessionVersion + 1,
      });
      if (currentUser) {
        await syncFromServer(currentUser.username);
        await useBookStore.getState().fetchBooks();
        await useBookStore.getState().loadFavorites();
      }
      return true;
    } catch (e) {
      set({ isBusy: false, error: e.message || '切换用户失败' });
      return false;
    }
  },

  refreshSession: async () => {
    const res = await sessionApi.getSession();
    const currentUser = res.currentUser || get().currentUser;
    setCurrentUsername(currentUser?.username || null);
    set({ currentUser, users: res.users || [] });
  },

  logout: async () => {
    await sessionApi.logout().catch(() => {});
    setCurrentUsername(null);
    usePlayerStore.getState().clearPlayer?.();
    useBookStore.setState({ books: [], favorites: [] });
    set({
      currentUser: null,
      sessionVersion: get().sessionVersion + 1,
    });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('audiooook:user-required', () => {
    setCurrentUsername(null);
    useSessionStore.setState({ currentUser: null, isReady: true });
  });
}

export default useSessionStore;
