import { motion } from 'framer-motion';
import {
  HiCheckCircle,
  HiOutlineDevicePhoneMobile,
  HiOutlinePlusCircle,
  HiOutlineShare,
} from 'react-icons/hi2';
import usePwaInstallPrompt from '../hooks/usePwaInstallPrompt';

export default function PwaInstallCard() {
  const {
    install,
    installResult,
    isInstalling,
    mode,
  } = usePwaInstallPrompt();

  if (mode === 'unsupported') return null;

  const isInstalled = mode === 'installed';
  const isIos = mode === 'ios';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card overflow-hidden"
    >
      <div className="relative p-4">
        <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-500">
            {isInstalled ? (
              <HiCheckCircle className="h-6 w-6" />
            ) : (
              <HiOutlineDevicePhoneMobile className="h-6 w-6" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">添加到主屏幕</h2>
              {isInstalled && (
                <span className="rounded-full bg-green-500/10 px-2.5 py-1 text-[10px] font-medium text-green-400">
                  已添加
                </span>
              )}
            </div>

            <p className="mt-1 text-xs leading-5 text-dark-400">
              {isInstalled
                ? '已经可以像 App 一样从桌面打开，听书会更沉浸。'
                : '把 AudioBook 放到桌面，打开更快，也更像原生 App。'}
            </p>

            {isIos ? (
              <div className="mt-3 rounded-2xl border border-dark-700/40 bg-dark-800/35 px-3 py-2.5 text-xs text-dark-300">
                <div className="mb-1 flex items-center gap-2 text-dark-200">
                  <HiOutlineShare className="h-4 w-4 text-primary-500" />
                  <span className="font-medium">iPhone / iPad 安装方式</span>
                </div>
                <p className="leading-5">
                  点击 Safari 底部分享按钮，然后选择“添加到主屏幕”。
                </p>
              </div>
            ) : (
              !isInstalled && (
                <button
                  type="button"
                  onClick={install}
                  disabled={isInstalling}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-500 px-4 py-3 text-sm font-semibold text-dark-900 shadow-lg shadow-primary-500/20 transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {isInstalling ? (
                    <span className="h-4 w-4 rounded-full border-2 border-dark-900/25 border-t-dark-900 animate-spin" />
                  ) : (
                    <HiOutlinePlusCircle className="h-5 w-5" />
                  )}
                  {isInstalling ? '正在唤起安装...' : '立即添加'}
                </button>
              )
            )}

            {installResult === 'dismissed' && (
              <p className="mt-2 text-[11px] text-dark-500">
                本次已取消安装，可以稍后再试。
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
