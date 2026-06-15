import assert from 'node:assert/strict';
import test from 'node:test';
import {
  THEME_MODES,
  getEffectiveTheme,
  normalizeThemeMode,
} from './theme.js';

test('normalizes unknown theme modes to system', () => {
  assert.equal(normalizeThemeMode('light'), THEME_MODES.LIGHT);
  assert.equal(normalizeThemeMode('dark'), THEME_MODES.DARK);
  assert.equal(normalizeThemeMode('system'), THEME_MODES.SYSTEM);
  assert.equal(normalizeThemeMode('sepia'), THEME_MODES.SYSTEM);
  assert.equal(normalizeThemeMode(undefined), THEME_MODES.SYSTEM);
});

test('resolves explicit and system theme modes', () => {
  assert.equal(getEffectiveTheme('light', true), 'light');
  assert.equal(getEffectiveTheme('dark', false), 'dark');
  assert.equal(getEffectiveTheme('system', true), 'dark');
  assert.equal(getEffectiveTheme('system', false), 'light');
});
