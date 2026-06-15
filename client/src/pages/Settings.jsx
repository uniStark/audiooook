import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineTrash,
  HiOutlineServerStack,
  HiOutlineFolderOpen,
  HiOutlineCloud,
  HiOutlineFolder,
  HiOutlinePlayCircle,
  HiOutlineArrowDownTray,
  HiOutlineArrowUpTray,
  HiOutlineMusicalNote,
  HiChevronRight,
  HiChevronDown,
  HiChevronUp,
  HiArrowUturnLeft,
  HiArrowPath,
  HiCheck,
  HiXMark,
} from 'react-icons/hi2';
import { configApi, uploadApi, sessionApi } from '../utils/api';
import useBookStore from '../stores/bookStore';
import useDownloadStore from '../stores/downloadStore';
import useSessionStore from '../stores/sessionStore';
import { Avatar } from '../components/UserGate';
import { getCacheSize, getAllCachedAudio, removeCachedAudio, getCachedAudioByBook, setSetting, getSetting } from '../utils/db';
import { formatSize } from '../utils/format';
import { THEME_MODES, getStoredThemeMode, saveThemeMode } from '../utils/theme';
import PwaInstallCard from '../components/PwaInstallCard';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [cacheSize, setCacheSize] = useState(0);
  const [cachedCount, setCachedCount] = useState(0);
  const [cacheLimitMB, setCacheLimitMB] = useState(300);
  const [clearing, setClearing] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resumeRewindSeconds, setResumeRewindSeconds] = useState(3);
  const [themeMode, setThemeMode] = useState(THEME_MODES.SYSTEM);
  const [activeSection, setActiveSection] = useState('common');
  const [showUserSwitcher, setShowUserSwitcher] = useState(false);
  const [switchTarget, setSwitchTarget] = useState('');
  const [switchPassword, setSwitchPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  // 上架图书
  const [uploadMode, setUploadMode] = useState('files');
  const [uploadBookName, setUploadBookName] = useState('');
  const [uploadSeasonName, setUploadSeasonName] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadRelativePaths, setUploadRelativePaths] = useState([]);
  const [diskSpace, setDiskSpace] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);
  // 下载管理
  const [cachedBooks, setCachedBooks] = useState([]);
  const [showCachedDetail, setShowCachedDetail] = useState(null);
  const [deletingKeys, setDeletingKeys] = useState(new Set());
  const { fetchBooks } = useBookStore();
  const { isDownloading: dlActive, tasks: dlTasks, completedCount: dlCompleted, totalCount: dlTotal, cancelDownload } = useDownloadStore();
  const { currentUser, users, switchUser, refreshSession, isBusy: sessionBusy, error: sessionError, sessionVersion } = useSessionStore();

  useEffect(() => {
    loadConfig();
    loadCacheInfo();
    loadLocalSettings();
    loadDiskSpace();
  }, [sessionVersion]);

  useEffect(() => {
    if (!switchTarget && users[0]) setSwitchTarget(users[0].username);
  }, [users, switchTarget]);

  const loadDiskSpace = async () => {
    try {
      const res = await uploadApi.getUploadPath();
      if (res.success && res.data) setDiskSpace(res.data);
    } catch { /* ignore */ }
  };

  const loadConfig = async () => {
    try {
      const res = await configApi.getConfig();
      setConfig(res.data);
      if (res.data.cacheSizeMB) {
        setCacheLimitMB(res.data.cacheSizeMB);
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  };

  const loadCacheInfo = async () => {
    const size = await getCacheSize();
    const all = await getAllCachedAudio();
    setCacheSize(size);
    setCachedCount(all.length);
    // 按书籍分组
    const bookMap = {};
    for (const item of all) {
      const bid = item.bookId || 'unknown';
      if (!bookMap[bid]) {
        bookMap[bid] = {
          bookId: bid,
          bookName: item.bookName || bid,
          episodes: [],
          totalSize: 0,
        };
      }
      bookMap[bid].episodes.push(item);
      bookMap[bid].totalSize += item.size || 0;
    }
    setCachedBooks(Object.values(bookMap).sort((a, b) => b.totalSize - a.totalSize));
  };

  const loadLocalSettings = async () => {
    const limit = await getSetting('cacheLimitMB', 300);
    setCacheLimitMB(limit);
    const rw = await getSetting('resumeRewindSeconds', 3);
    setResumeRewindSeconds(rw);
    setThemeMode(getStoredThemeMode());
  };

  const handleThemeModeChange = (mode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
  };

  const handleClearCache = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const all = await getAllCachedAudio();
      for (const item of all) {
        await removeCachedAudio(item.key);
      }
      await loadCacheInfo();
    } finally {
      setClearing(false);
    }
  };

  const handleCacheLimitChange = async (value) => {
    const mb = Math.max(50, Math.min(5000, parseInt(value) || 300));
    setCacheLimitMB(mb);
    await setSetting('cacheLimitMB', mb);
    try {
      await configApi.updateConfig({ cacheSizeMB: mb });
    } catch (e) {
      // 离线时忽略
    }
  };

  const handlePathSelected = async (newPath) => {
    try {
      const res = await configApi.updateConfig({ audiobookPath: newPath });
      if (res.success) {
        setConfig(prev => ({ ...prev, audiobookPath: newPath }));
        setShowBrowser(false);
        // 自动刷新书架
        await fetchBooks();
      }
    } catch (e) {
      console.error('Failed to update path:', e);
    }
  };

  const handleRefreshBooks = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchBooks();
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileMessage('');
    try {
      await sessionApi.uploadAvatar(file);
      await refreshSession();
      setProfileMessage('头像已更新');
    } catch (err) {
      setProfileMessage(err.message || '头像上传失败');
    } finally {
      e.target.value = '';
    }
  };

  const handleSwitchUser = async (e) => {
    e.preventDefault();
    const ok = await switchUser(switchTarget, switchPassword);
    if (ok) {
      setSwitchPassword('');
      setShowUserSwitcher(false);
      await loadCacheInfo();
      await loadLocalSettings();
    }
  };

  const audioExts = '.mp3,.wma,.wav,.flac,.aac,.ogg,.m4a,.opus,.ape,.alac';
  const archiveExts = '.zip,.7z,.rar,.tar,.tar.gz,.tgz,.tar.bz2,.tar.xz';

  const handleFilesSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setUploadFiles(files);
    setUploadRelativePaths([]);
    setUploadResult(null);
  };

  const handleFolderSelect = (e) => {
    const allFiles = Array.from(e.target.files || []);
    const audioFiles = allFiles.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ['mp3','wma','wav','flac','aac','ogg','m4a','opus','ape','alac'].includes(ext);
    });
    setUploadFiles(audioFiles);
    setUploadRelativePaths(audioFiles.map(f => f.webkitRelativePath));
    setUploadResult(null);
    // Auto-fill book name from folder name
    if (audioFiles.length > 0 && !uploadBookName) {
      const firstPath = audioFiles[0].webkitRelativePath;
      const folderName = firstPath.split('/')[0];
      if (folderName) setUploadBookName(folderName);
    }
  };

  const handleArchiveSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setUploadFiles(files.slice(0, 1));
    setUploadRelativePaths([]);
    setUploadResult(null);
    // Auto-fill book name from archive name
    if (files[0] && !uploadBookName) {
      const name = files[0].name.replace(/\.(zip|7z|rar|tar\.gz|tar\.bz2|tar\.xz|tgz|tar)$/i, '');
      setUploadBookName(name);
    }
  };

  const resetUpload = () => {
    setUploadFiles([]);
    setUploadRelativePaths([]);
    setUploadBookName('');
    setUploadSeasonName('');
    setUploadResult(null);
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0 || uploading) return;
    if (uploadMode === 'files' && !uploadBookName.trim()) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('mode', uploadMode);
      if (uploadBookName.trim()) formData.append('bookName', uploadBookName.trim());
      if (uploadMode === 'files' && uploadSeasonName.trim()) {
        formData.append('seasonName', uploadSeasonName.trim());
      }
      if (uploadMode === 'folder') {
        formData.append('relativePaths', JSON.stringify(uploadRelativePaths));
      }
      for (const file of uploadFiles) {
        formData.append('files', file);
      }
      const res = await uploadApi.uploadFiles(formData, setUploadProgress);
      if (res.success) {
        const d = res.data;
        let msg = uploadMode === 'archive'
          ? `解压完成 → "${d.bookName}"`
          : `上传成功 ${d.uploadedCount} 个文件 → "${d.bookName}"`;
        if (d.convertingCount > 0) msg += `，${d.convertingCount} 个正在转换格式`;
        setUploadResult({ type: 'success', message: msg });
        resetUpload();
        loadDiskSpace();
        await fetchBooks();
      }
    } catch (e) {
      setUploadResult({ type: 'error', message: e.message || '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  const cachePercentage = cacheLimitMB > 0 ? Math.min(100, (cacheSize / (cacheLimitMB * 1024 * 1024)) * 100) : 0;
  const settingsSections = [
    { key: 'common', label: '常用' },
    { key: 'library', label: '书库' },
    { key: 'offline', label: '离线' },
    { key: 'advanced', label: '上传/高级' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="page-container"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">设置</h1>
        <p className="text-sm text-dark-400 mt-1">外观、播放和书库管理</p>
      </div>

      {currentUser && (
        <div className="glass-card p-4 mb-4">
          <div className="flex items-center gap-3">
            <label className="relative cursor-pointer active:scale-95 transition-transform">
              <Avatar user={currentUser} className="w-14 h-14" />
              <span className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-primary-500 text-white text-xs grid place-items-center shadow-lg">
                +
              </span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleAvatarChange} className="hidden" />
            </label>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-dark-500">当前用户</p>
              <h2 className="font-semibold truncate">{currentUser.username}</h2>
              <p className="text-xs text-dark-500 mt-0.5">{profileMessage || '点击头像可上传自己的头像'}</p>
            </div>
            <button
              onClick={() => setShowUserSwitcher(true)}
              className="touch-target rounded-2xl px-3 py-2 text-sm text-primary-500 bg-primary-500/10 active:scale-95"
            >
              切换
            </button>
          </div>
        </div>
      )}

      <div className="glass-card p-2 mb-4 sticky top-2 z-10 backdrop-blur-xl">
        <div className="segmented-control grid-cols-4" role="tablist" aria-label="设置分类">
          {settingsSections.map((section) => (
            <button
              key={section.key}
              type="button"
              role="tab"
              aria-selected={activeSection === section.key}
              onClick={() => setActiveSection(section.key)}
              className={`segmented-option text-xs ${
                activeSection === section.key ? 'segmented-option-active' : 'segmented-option-idle'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {activeSection === 'common' && (
          <>
        <div className="glass-card p-4">
          <div className="mb-3">
            <h2 className="font-semibold">外观</h2>
            <p className="text-xs text-dark-500 mt-1">选择适合阅读和夜间收听的界面主题</p>
          </div>
          <div className="segmented-control grid-cols-3">
            {[
              { key: THEME_MODES.SYSTEM, label: '跟随系统' },
              { key: THEME_MODES.LIGHT, label: '浅色' },
              { key: THEME_MODES.DARK, label: '深色' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleThemeModeChange(item.key)}
                className={`segmented-option ${
                  themeMode === item.key ? 'segmented-option-active' : 'segmented-option-idle'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <PwaInstallCard />
          </>
        )}

        {/* 服务器信息 */}
        {activeSection === 'library' && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <HiOutlineServerStack className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold">服务器</h2>
            </div>
            <button
              onClick={handleRefreshBooks}
              disabled={refreshing}
              className="touch-target flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
            >
              <HiArrowPath className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '刷新中' : '刷新书库'}
            </button>
          </div>
          {config ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-dark-400 flex items-center gap-2">
                    <HiOutlineFolderOpen className="w-4 h-4" />
                    有声书路径
                  </span>
                </div>
                <div
                  onClick={() => !config.pathLocked && setShowBrowser(true)}
                  className={`flex items-center gap-2 field-ios ${config.pathLocked ? '' : 'cursor-pointer active:scale-[0.98]'}`}
                >
                  <HiOutlineFolder className="w-4 h-4 text-primary-500 flex-shrink-0" />
                  <span className="text-dark-200 text-xs truncate flex-1">
                    {config.audiobookPath}
                  </span>
                  {config.pathLocked ? (
                    <span className="text-[10px] text-dark-500 flex-shrink-0">当前用户</span>
                  ) : (
                    <HiChevronRight className="w-4 h-4 text-dark-500 flex-shrink-0" />
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-dark-400 flex items-center gap-2">
                  <HiOutlineCloud className="w-4 h-4" />
                  OSS存储
                </span>
                <span className={config.ossEnabled ? 'text-green-500' : 'text-dark-500'}>
                  {config.ossEnabled ? '已启用' : '未配置'}
                </span>
              </div>

            </div>
          ) : (
            <p className="text-sm text-dark-500">加载中...</p>
          )}
        </div>
        )}

        {/* 上架图书 */}

        {activeSection === 'advanced' && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <HiOutlineArrowUpTray className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold">上架图书</h2>
          </div>
          <p className="text-[10px] text-dark-500 mb-1">
            支持 MP3、M4A、AAC、WAV、FLAC、OGG、Opus、ALAC 等；<span className="text-amber-400/90">WMA、APE 需转码</span>，上传后会自动转为 M4A
          </p>
          {diskSpace && (
            <p className={`text-[10px] mb-3 ${diskSpace.availableBytes >= 0 && diskSpace.availableBytes < 500 * 1024 * 1024 ? 'text-red-400' : 'text-dark-500'}`}>
              存储路径：{diskSpace.path} ·
              可用空间：{diskSpace.availableFormatted}
              {diskSpace.availableBytes >= 0 && diskSpace.availableBytes < 500 * 1024 * 1024 && ' ⚠ 空间不足'}
            </p>
          )}

          {/* 模式切换 */}
          <div className="segmented-control grid-cols-3 mb-3">
            {[
              { key: 'files', label: '文件' },
              { key: 'folder', label: '文件夹' },
              { key: 'archive', label: '压缩包' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => { setUploadMode(m.key); resetUpload(); }}
                className={`segmented-option ${
                  uploadMode === m.key
                    ? 'segmented-option-active'
                    : 'segmented-option-idle'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {/* 书名 */}
            <div>
              <label className="text-xs text-dark-400 mb-1 block">
                书名{uploadMode === 'files' ? ' *' : '（可选，自动识别）'}
              </label>
              <input
                type="text"
                value={uploadBookName}
                onChange={(e) => setUploadBookName(e.target.value)}
                placeholder={uploadMode === 'archive' ? '默认取压缩包名称' : uploadMode === 'folder' ? '默认取文件夹名称' : '输入小说名称'}
                className="field-ios"
              />
            </div>

            {/* 季/章节 — only for file mode */}
            {uploadMode === 'files' && (
              <div>
                <label className="text-xs text-dark-400 mb-1 block">季/章节（可选）</label>
                <input
                  type="text"
                  value={uploadSeasonName}
                  onChange={(e) => setUploadSeasonName(e.target.value)}
                  placeholder="如：第一季、七星鲁王宫"
                  className="field-ios"
                />
              </div>
            )}

            {/* File picker */}
            <div>
              <label className="text-xs text-dark-400 mb-1.5 block">
                {uploadMode === 'archive' ? '压缩包文件' : uploadMode === 'folder' ? '选择文件夹' : '音频文件'}
              </label>

              {uploadMode === 'files' && (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-dark-600 hover:border-primary-500/50 rounded-2xl p-4 cursor-pointer transition-colors">
                  <HiOutlineMusicalNote className="w-8 h-8 text-dark-500" />
                  <span className="text-xs text-dark-400">
                    {uploadFiles.length > 0 ? `已选择 ${uploadFiles.length} 个音频文件` : '点击选择音频文件'}
                  </span>
                  {uploadFiles.length > 0 && (
                    <span className="text-[10px] text-dark-500">
                      {(uploadFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                  <input type="file" accept={audioExts} multiple onChange={handleFilesSelect} className="hidden" />
                </label>
              )}

              {uploadMode === 'folder' && (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-dark-600 hover:border-primary-500/50 rounded-2xl p-4 cursor-pointer transition-colors">
                  <HiOutlineFolderOpen className="w-8 h-8 text-dark-500" />
                  <span className="text-xs text-dark-400">
                    {uploadFiles.length > 0 ? `已选择 ${uploadFiles.length} 个音频文件` : '点击选择有声书文件夹'}
                  </span>
                  {uploadFiles.length > 0 && (
                    <span className="text-[10px] text-dark-500">
                      {(uploadFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                  {/* webkitdirectory triggers folder selection */}
                  <input type="file" webkitdirectory="" directory="" multiple onChange={handleFolderSelect} className="hidden" />
                </label>
              )}

              {uploadMode === 'archive' && (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-dark-600 hover:border-primary-500/50 rounded-2xl p-4 cursor-pointer transition-colors">
                  <HiOutlineArrowDownTray className="w-8 h-8 text-dark-500" />
                  <span className="text-xs text-dark-400">
                    {uploadFiles.length > 0 ? uploadFiles[0].name : '支持 ZIP / 7Z / RAR / TAR.GZ'}
                  </span>
                  {uploadFiles.length > 0 && (
                    <span className="text-[10px] text-dark-500">
                      {(uploadFiles[0].size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                  <input type="file" accept={archiveExts} onChange={handleArchiveSelect} className="hidden" />
                </label>
              )}
            </div>

            {/* 上传进度 */}
            {uploading && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-dark-400">{uploadMode === 'archive' ? '上传并解压中...' : '上传中...'}</span>
                  <span className="text-primary-500">{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {/* 上传结果 */}
            {uploadResult && (
              <div className={`text-xs px-3 py-2 rounded-lg ${
                uploadResult.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {uploadResult.message}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading || uploadFiles.length === 0 || (uploadMode === 'files' && !uploadBookName.trim())}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : (
                <HiOutlineArrowUpTray className="w-5 h-5" />
              )}
              <span className="text-sm font-medium">
                {uploading ? '上传中...' : uploadMode === 'archive' ? '上传并解压' : '上传到服务器'}
              </span>
            </button>
          </div>
        </div>
        )}

        {/* 播放设置 */}

        {activeSection === 'common' && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <HiOutlinePlayCircle className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold">播放设置</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <div>
                  <span className="text-dark-300">继续播放回退</span>
                  <p className="text-[10px] text-dark-500 mt-0.5">恢复播放时自动回退几秒</p>
                </div>
                <span className="text-primary-500 text-sm font-medium">{resumeRewindSeconds}秒</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={resumeRewindSeconds}
                onChange={async (e) => {
                  const val = parseInt(e.target.value) || 0;
                  setResumeRewindSeconds(val);
                  await setSetting('resumeRewindSeconds', val);
                }}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-dark-600 mt-0.5">
                <span>0秒</span>
                <span>30秒</span>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* 活跃下载进度 */}

        {activeSection === 'offline' && dlActive && dlTasks.length > 0 && (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
                <h2 className="font-semibold text-sm">正在下载</h2>
              </div>
              <button
                onClick={cancelDownload}
                className="touch-target text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-all"
              >
                取消下载
              </button>
            </div>
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-dark-400">总进度 {dlCompleted}/{dlTotal}</span>
                <span className="text-primary-500">{dlTotal > 0 ? Math.round((dlCompleted / dlTotal) * 100) : 0}%</span>
              </div>
              <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                  style={{ width: `${dlTotal > 0 ? (dlCompleted / dlTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
            {(() => {
              const current = dlTasks.find(t => t.status === 'downloading');
              return current ? (
                <div className="text-[10px] text-dark-500">
                  <div className="flex justify-between mb-0.5">
                    <span className="truncate">{current.episodeName}</span>
                    <span className="ml-2 flex-shrink-0">{current.progress}%</span>
                  </div>
                  <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-400/70 rounded-full transition-all duration-150"
                      style={{ width: `${current.progress}%` }}
                    />
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* 缓存管理 */}
        {activeSection === 'offline' && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">离线缓存</h2>
            <span className="text-xs text-dark-400">{cachedCount} 个文件</span>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-dark-400">已使用 {formatSize(cacheSize)}</span>
              <span className="text-dark-500">限制 {cacheLimitMB}MB</span>
            </div>
            <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  cachePercentage > 90 ? 'bg-red-500' :
                  cachePercentage > 70 ? 'bg-yellow-500' : 'bg-primary-500'
                }`}
                style={{ width: `${cachePercentage}%` }}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-sm text-dark-400 mb-2 block">
              缓存大小限制：{cacheLimitMB} MB
            </label>
            <input
              type="range"
              min="50"
              max="5000"
              step="50"
              value={cacheLimitMB}
              onChange={(e) => handleCacheLimitChange(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-dark-500 mt-1">
              <span>50MB</span>
              <span>5GB</span>
            </div>
          </div>

          <button
            onClick={handleClearCache}
            disabled={clearing || cacheSize === 0}
            className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 py-3 rounded-xl transition-all disabled:opacity-50"
          >
            {clearing ? (
              <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
            ) : (
              <HiOutlineTrash className="w-5 h-5" />
            )}
            <span className="text-sm font-medium">
              {clearing ? '清除中...' : '清除所有缓存'}
            </span>
          </button>
        </div>

        )}

        {/* 下载管理 */}
        {activeSection === 'offline' && cachedBooks.length > 0 && (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <HiOutlineArrowDownTray className="w-5 h-5 text-primary-500" />
                <h2 className="font-semibold">已下载内容</h2>
              </div>
              <span className="text-xs text-dark-400">{formatSize(cacheSize)}</span>
            </div>
            <div className="space-y-2">
              {cachedBooks.map((cb) => (
                <div key={cb.bookId} className="bg-dark-800/50 rounded-xl overflow-hidden">
                  <div
                    className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-dark-700/50 transition-colors"
                    onClick={() => setShowCachedDetail(showCachedDetail === cb.bookId ? null : cb.bookId)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-dark-200 truncate">{cb.bookName}</p>
                      <p className="text-[10px] text-dark-500 mt-0.5">{cb.episodes.length}集 · {formatSize(cb.totalSize)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`确定删除「${cb.bookName}」的所有缓存？`)) return;
                          for (const ep of cb.episodes) {
                            await removeCachedAudio(ep.key);
                          }
                          await loadCacheInfo();
                        }}
                        className="touch-target text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                        title="删除该书全部缓存"
                        aria-label={`删除${cb.bookName}的全部缓存`}
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                      {showCachedDetail === cb.bookId ? (
                        <HiChevronUp className="w-4 h-4 text-dark-500" />
                      ) : (
                        <HiChevronDown className="w-4 h-4 text-dark-500" />
                      )}
                    </div>
                  </div>
                  {showCachedDetail === cb.bookId && (
                    <div className="border-t border-dark-700/30 px-3 py-1 max-h-48 overflow-y-auto">
                      {cb.episodes
                        .sort((a, b) => (a.seasonName || '').localeCompare(b.seasonName || '') || (a.episodeName || '').localeCompare(b.episodeName || ''))
                        .map((ep) => (
                        <div key={ep.key} className="flex items-center justify-between py-1.5 text-xs border-b border-dark-700/20 last:border-b-0">
                          <div className="flex-1 min-w-0">
                            <span className="text-dark-300 truncate block">
                              {ep.seasonName ? `${ep.seasonName} · ` : ''}{ep.episodeName || ep.key}
                            </span>
                            <span className="text-dark-500 text-[10px]">{formatSize(ep.size || 0)}</span>
                          </div>
                          <button
                            disabled={deletingKeys.has(ep.key)}
                            onClick={async () => {
                              setDeletingKeys(prev => new Set(prev).add(ep.key));
                              await removeCachedAudio(ep.key);
                              await loadCacheInfo();
                              setDeletingKeys(prev => {
                                const s = new Set(prev);
                                s.delete(ep.key);
                                return s;
                              });
                            }}
                            className="touch-target text-dark-500 hover:text-red-400 p-1 rounded transition-colors disabled:opacity-30 flex-shrink-0"
                            aria-label={`删除${ep.episodeName || ep.key}缓存`}
                          >
                            {deletingKeys.has(ep.key) ? (
                              <div className="w-3.5 h-3.5 border border-dark-500 border-t-red-400 rounded-full animate-spin" />
                            ) : (
                              <HiXMark className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 关于 */}
        {activeSection === 'advanced' && (
        <div className="glass-card p-4">
          <h2 className="font-semibold mb-3">关于</h2>
          <div className="space-y-2 text-sm text-dark-400">
            <p>AudioBook - 在线听书 v1.0.0</p>
            <p>支持格式：MP3, WMA, WAV, FLAC, AAC, OGG, M4A, OPUS</p>
            <p className="text-dark-500 text-xs mt-2">
              将有声书文件夹按照"小说名/季(章节)/集"的结构放入服务器指定目录即可自动识别
            </p>
            <div className="pt-3 border-t border-dark-700/30 mt-3">
              <p className="text-dark-500 text-xs">
                Created by <span className="text-primary-500/80 font-medium">Adrian Stark</span>
              </p>
            </div>
          </div>
        </div>
        )}
      </div>

      <AnimatePresence>
        {showUserSwitcher && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 backdrop-blur-sm flex items-end justify-center"
            style={{ background: 'var(--scrim)' }}
            onClick={() => setShowUserSwitcher(false)}
          >
            <motion.form
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="ios-bottom-sheet app-shell-width rounded-t-3xl p-4 pb-safe backdrop-blur-xl"
              style={{ background: 'var(--surface-card-strong)' }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleSwitchUser}
            >
              <div className="w-12 h-1.5 rounded-full bg-dark-600 mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-1">切换用户</h3>
              <p className="text-xs text-dark-500 mb-4">切换时需要输入目标用户的创建密码。</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {users.map((user) => (
                  <button
                    key={user.username}
                    type="button"
                    onClick={() => setSwitchTarget(user.username)}
                    className={`rounded-2xl p-3 text-left transition-all ${
                      switchTarget === user.username ? 'bg-primary-500/15 ring-1 ring-primary-500/40' : 'bg-dark-800/40'
                    }`}
                  >
                    <Avatar user={user} className="w-10 h-10 mb-2" />
                    <span className="text-sm font-medium truncate block">{user.username}</span>
                  </button>
                ))}
              </div>
              <input className="field-ios mb-3" value={switchTarget} onChange={(e) => setSwitchTarget(e.target.value)} placeholder="用户名" autoComplete="username" />
              <input className="field-ios mb-3" value={switchPassword} onChange={(e) => setSwitchPassword(e.target.value)} placeholder="输入该用户密码" type="password" autoComplete="current-password" />
              {sessionError && <p className="text-sm text-red-400 bg-red-500/10 rounded-2xl px-3 py-2 mb-3">{sessionError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowUserSwitcher(false)} className="flex-1 py-3 rounded-xl text-sm font-medium text-dark-300 bg-dark-700/50">取消</button>
                <button type="submit" className="btn-primary flex-1" disabled={sessionBusy}>{sessionBusy ? '切换中...' : '确认切换'}</button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 目录浏览器弹窗 */}
      <AnimatePresence>
        {showBrowser && (
          <DirBrowser
            currentPath={config?.audiobookPath || ''}
            onSelect={handlePathSelected}
            onClose={() => setShowBrowser(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ===== 目录浏览器组件 =====
function DirBrowser({ currentPath, onSelect, onClose }) {
  const [browsePath, setBrowsePath] = useState(currentPath || '');
  const [entries, setEntries] = useState([]);
  const [parentPath, setParentPath] = useState(null);
  const [drives, setDrives] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inputPath, setInputPath] = useState('');
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    loadDir(browsePath);
  }, []);

  const loadDir = async (dirPath) => {
    setLoading(true);
    setError('');
    try {
      const res = await configApi.browseDir(dirPath);
      if (res.success) {
        setBrowsePath(res.data.current);
        setEntries(res.data.entries || []);
        setParentPath(res.data.parent);
        setDrives(res.data.drives);
        setInputPath(res.data.current);
      }
    } catch (e) {
      const msg = e?.error || e?.message || '无法读取目录';
      setError(msg.includes('无法读取') || msg.includes('不存在') || msg.includes('不是目录')
        ? msg
        : '无法读取目录: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoTo = (entry) => {
    // 如果传入的是对象（目录条目），检查权限
    if (typeof entry === 'object') {
      if (entry.readable === false) {
        setError(`无权限访问: ${entry.name}`);
        setTimeout(() => setError(''), 2000);
        return;
      }
      loadDir(entry.path);
    } else {
      // 传入的是路径字符串（上级目录、盘符等）
      loadDir(entry);
    }
  };

  const handleInputGo = () => {
    if (inputPath.trim()) {
      loadDir(inputPath.trim());
      setShowInput(false);
    }
  };

  const handleConfirm = () => {
    onSelect(browsePath);
  };

  // 路径面包屑
  const pathParts = browsePath.split(/[/\\]/).filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 backdrop-blur-sm flex items-end justify-center"
        style={{ background: 'var(--scrim)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="ios-bottom-sheet app-shell-width rounded-t-3xl flex flex-col backdrop-blur-xl"
          style={{ background: 'var(--surface-card-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700/50">
          <h3 className="font-semibold text-white">选择有声书目录</h3>
          <button onClick={onClose} className="touch-target text-dark-400 hover:text-white p-1" aria-label="关闭目录浏览器">
            <HiXMark className="w-6 h-6" />
          </button>
        </div>

        {/* 当前路径 & 面包屑 */}
        <div className="px-4 py-2 border-b border-dark-700/30">
          {showInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInputGo()}
                autoFocus
                placeholder="输入路径..."
                className="field-ios flex-1 text-xs"
              />
              <button onClick={handleInputGo} className="touch-target text-primary-500 text-xs font-medium px-2">
                前往
              </button>
              <button onClick={() => setShowInput(false)} className="touch-target text-dark-400 text-xs px-1">
                取消
              </button>
            </div>
          ) : (
            <div
              onClick={() => setShowInput(true)}
              className="text-xs text-dark-400 truncate cursor-pointer hover:text-dark-200 transition-colors py-1"
              title="点击手动输入路径"
            >
              {browsePath || '/'}
            </div>
          )}
        </div>

        {/* 导航按钮 */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-dark-700/30">
          {parentPath && (
            <button
              onClick={() => handleGoTo(parentPath)}
              className="touch-target flex items-center gap-1 text-xs text-dark-300 hover:text-white bg-dark-700/50 hover:bg-dark-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <HiArrowUturnLeft className="w-3.5 h-3.5" />
              上级目录
            </button>
          )}
          {drives && drives.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {drives.map((d) => (
                <button
                  key={d.path}
                  onClick={() => handleGoTo(d.path)}
                  className="touch-target text-xs text-dark-300 hover:text-white bg-dark-700/50 hover:bg-dark-700 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}
          {/* 权限错误提示 */}
          {error && !loading && entries.length > 0 && (
            <span className="text-xs text-red-400 ml-auto">{error}</span>
          )}
        </div>

        {/* 目录列表 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-dark-600 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-dark-400 text-sm">{error}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <HiOutlineFolder className="w-10 h-10 text-dark-600 mx-auto mb-2" />
              <p className="text-dark-500 text-sm">此目录下没有子文件夹</p>
            </div>
          ) : (
            <div className="py-1">
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => handleGoTo(entry)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    entry.readable === false
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-dark-800 active:bg-dark-700'
                  }`}
                >
                  <HiOutlineFolder className={`w-5 h-5 flex-shrink-0 ${
                    entry.readable === false ? 'text-dark-500' : 'text-primary-500/70'
                  }`} />
                  <span className={`text-sm truncate flex-1 ${
                    entry.readable === false ? 'text-dark-500' : 'text-dark-200'
                  }`}>
                    {entry.name}
                  </span>
                  {entry.readable === false ? (
                    <span className="text-[10px] text-dark-500 flex-shrink-0">无权限</span>
                  ) : (
                    <HiChevronRight className="w-4 h-4 text-dark-600 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 底部确认 */}
        <div className="p-4 pb-safe border-t border-dark-700/50 space-y-2">
          <p className="text-xs text-dark-500 truncate">
            选中：{browsePath}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium text-dark-300 bg-dark-700/50 hover:bg-dark-700 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <HiCheck className="w-5 h-5" />
              确认选择
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
