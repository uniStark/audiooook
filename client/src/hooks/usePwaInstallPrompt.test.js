import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPwaDisplayMode,
  isIosLike,
  isStandaloneDisplay,
} from './usePwaInstallPrompt.js';

test('detects standalone display from display mode and navigator flag', () => {
  assert.equal(isStandaloneDisplay({ displayMode: 'standalone' }), true);
  assert.equal(isStandaloneDisplay({ displayMode: 'browser', navigatorStandalone: true }), true);
  assert.equal(isStandaloneDisplay({ displayMode: 'browser', navigatorStandalone: false }), false);
});

test('detects iOS-like browsers including iPadOS desktop mode', () => {
  assert.equal(isIosLike({ platform: 'iPhone', userAgent: 'Safari' }), true);
  assert.equal(isIosLike({ platform: 'MacIntel', maxTouchPoints: 5, userAgent: 'Safari' }), true);
  assert.equal(isIosLike({ platform: 'Win32', maxTouchPoints: 0, userAgent: 'Chrome' }), false);
});

test('resolves install display mode', () => {
  assert.equal(getPwaDisplayMode({ isInstalled: true, isIos: false, canInstall: true }), 'installed');
  assert.equal(getPwaDisplayMode({ isInstalled: false, isIos: true, canInstall: false }), 'ios');
  assert.equal(getPwaDisplayMode({ isInstalled: false, isIos: false, canInstall: true }), 'prompt');
  assert.equal(getPwaDisplayMode({ isInstalled: false, isIos: false, canInstall: false }), 'unsupported');
});
