import { useCallback, useEffect, useMemo, useState } from 'react';

export function isStandaloneDisplay({
  displayMode = 'browser',
  navigatorStandalone = false,
} = {}) {
  return displayMode === 'standalone' || navigatorStandalone === true;
}

export function isIosLike({
  platform = '',
  userAgent = '',
  maxTouchPoints = 0,
} = {}) {
  return /iPad|iPhone|iPod/.test(platform)
    || (platform === 'MacIntel' && maxTouchPoints > 1 && /Safari/i.test(userAgent));
}

export function getPwaDisplayMode({ isInstalled, isIos, canInstall }) {
  if (isInstalled) return 'installed';
  if (isIos) return 'ios';
  if (canInstall) return 'prompt';
  return 'unsupported';
}

function readDisplayMode() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'browser';
  }
  return window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
}

function readNavigatorStandalone() {
  if (typeof navigator === 'undefined') return false;
  return navigator.standalone === true;
}

function readIsIos() {
  if (typeof navigator === 'undefined') return false;
  return isIosLike({
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints || 0,
  });
}

export default function usePwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => (
    isStandaloneDisplay({
      displayMode: readDisplayMode(),
      navigatorStandalone: readNavigatorStandalone(),
    })
  ));
  const [isInstalling, setIsInstalling] = useState(false);
  const [installResult, setInstallResult] = useState(null);
  const [isIos] = useState(readIsIos);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setInstallResult(null);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setInstallResult('accepted');
    };

    const handleDisplayModeChange = (event) => {
      if (event.matches) {
        setIsInstalled(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;
    if (media?.addEventListener) {
      media.addEventListener('change', handleDisplayModeChange);
    } else {
      media?.addListener?.(handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (media?.removeEventListener) {
        media.removeEventListener('change', handleDisplayModeChange);
      } else {
        media?.removeListener?.(handleDisplayModeChange);
      }
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt || isInstalling) return null;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setInstallResult(choice?.outcome || null);
      if (choice?.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      return choice;
    } finally {
      setIsInstalling(false);
    }
  }, [deferredPrompt, isInstalling]);

  const mode = useMemo(() => getPwaDisplayMode({
    isInstalled,
    isIos,
    canInstall: Boolean(deferredPrompt),
  }), [deferredPrompt, isInstalled, isIos]);

  return {
    canInstall: Boolean(deferredPrompt),
    install,
    installResult,
    isInstalling,
    isInstalled,
    isIos,
    mode,
  };
}
