export const THEME_MODES = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark',
};

export const THEME_STORAGE_KEY = 'audiooook.theme';

export function normalizeThemeMode(mode) {
  return Object.values(THEME_MODES).includes(mode) ? mode : THEME_MODES.SYSTEM;
}

export function getEffectiveTheme(mode, systemPrefersDark) {
  const normalized = normalizeThemeMode(mode);
  if (normalized === THEME_MODES.SYSTEM) {
    return systemPrefersDark ? THEME_MODES.DARK : THEME_MODES.LIGHT;
  }
  return normalized;
}

export function getSystemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getStoredThemeMode() {
  if (typeof window === 'undefined') return THEME_MODES.SYSTEM;
  return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function applyThemeMode(mode) {
  if (typeof document === 'undefined') return THEME_MODES.DARK;

  const normalized = normalizeThemeMode(mode);
  const effective = getEffectiveTheme(normalized, getSystemPrefersDark());
  const root = document.documentElement;

  root.dataset.themeMode = normalized;
  root.dataset.theme = effective;
  root.style.colorScheme = effective;

  return effective;
}

export function saveThemeMode(mode) {
  const normalized = normalizeThemeMode(mode);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
  }
  return applyThemeMode(normalized);
}

export function initTheme() {
  const mode = getStoredThemeMode();
  applyThemeMode(mode);

  if (typeof window === 'undefined' || !window.matchMedia) return () => {};

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    if (getStoredThemeMode() === THEME_MODES.SYSTEM) {
      applyThemeMode(THEME_MODES.SYSTEM);
    }
  };

  media.addEventListener?.('change', handleChange);
  return () => media.removeEventListener?.('change', handleChange);
}
