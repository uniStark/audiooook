import { registerSW } from 'virtual:pwa-register';

let initialized = false;

export function initPwaUpdates() {
  if (initialized) return;
  initialized = true;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      registration?.update();
      setInterval(() => registration?.update(), 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.warn('[PWA] Service Worker registration failed:', error);
    },
  });
}
