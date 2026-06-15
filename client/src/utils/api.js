const API_BASE = '/api';

async function request(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  
  if (!response.ok) {
    let data = null;
    try {
      data = await response.clone().json();
    } catch { /* ignore non-json error responses */ }
    if (response.status === 401) {
      if (data?.authRequired && typeof window !== 'undefined') {
        await clearServiceWorkersForAuth();
        window.location.assign('/');
      }
      if (data?.userRequired && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('audiooook:user-required'));
      }
    }
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

async function clearServiceWorkersForAuth() {
  if (typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // Auth protection should not depend on service worker cleanup succeeding.
  }
}

// 书籍相关API
export const bookApi = {
  // 获取所有书籍
  getBooks: () => request('/books'),
  
  // 获取单本书详情
  getBook: (bookId) => request(`/books/${bookId}`),
  
  // 获取封面URL
  getCoverUrl: (bookId) => `${API_BASE}/books/${bookId}/cover`,

  getArtworkUrl: (bookId) => `${API_BASE}/books/${bookId}/artwork`,
  
  // 更新书籍元数据
  updateMetadata: (bookId, data) => request(`/books/${bookId}/metadata`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  // 上传自定义封面
  uploadCover: (bookId, file) => {
    return request(`/books/${bookId}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
  },
  
  // 获取音频流URL
  getAudioUrl: (bookId, seasonId, episodeId) =>
    `${API_BASE}/audio/${bookId}/${seasonId}/${episodeId}`,
  
  // 获取音频下载URL
  getDownloadUrl: (bookId, seasonId, episodeId) =>
    `${API_BASE}/audio/download/${bookId}/${seasonId}/${episodeId}`,

  // 获取格式转换进度
  getConversionStatus: (bookId) =>
    request(`/books/${bookId}/conversion-status`),
};

// 用户数据API（服务端持久化：收藏、播放进度、用户设置）
export const userApi = {
  // 收藏
  getFavorites: () => request('/user/favorites'),
  addFavorite: (bookId, data) => request(`/user/favorites/${bookId}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeFavorite: (bookId) => request(`/user/favorites/${bookId}`, { method: 'DELETE' }),
  // 播放进度
  getAllProgress: () => request('/user/progress'),
  saveProgress: (bookId, data) => request(`/user/progress/${bookId}`, { method: 'PUT', body: JSON.stringify(data) }),
  // 用户设置
  getSettings: () => request('/user/settings'),
  saveSettings: (data) => request(`/user/settings`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const sessionApi = {
  getSession: () => request('/session'),
  login: (username, password) => request('/session/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  switchUser: (username, password) => request('/session/switch', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  createUser: (username, password) => request('/session/create', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  logout: () => request('/session/logout', { method: 'POST' }),
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await fetch(`${API_BASE}/session/avatar`, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  },
};

// 上传API
export const uploadApi = {
  uploadFiles: (formData, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/upload`);
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error || `HTTP ${xhr.status}`));
        } catch { reject(new Error(`HTTP ${xhr.status}`)); }
      };
      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.send(formData);
    });
  },
  getUploadPath: () => request('/upload/path'),
};

// 配置相关API
export const configApi = {
  getConfig: () => request('/config'),
  updateConfig: (data) => request('/config', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  // 浏览服务器目录
  browseDir: (dirPath) => request(`/config/browse?path=${encodeURIComponent(dirPath || '')}`),
};
