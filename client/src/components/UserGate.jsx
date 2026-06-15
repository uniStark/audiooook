import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import useSessionStore from '../stores/sessionStore';

export default function UserGate({ children }) {
  const { currentUser, users, isReady, isBusy, error, loadSession, login } = useSessionStore();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!username && users[0]) setUsername(users[0].username);
  }, [users, username]);

  if (!isReady) {
    return (
      <div className="min-h-dvh grid place-items-center px-6">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
      </div>
    );
  }

  if (currentUser) return children;

  const submit = async (e) => {
    e.preventDefault();
    await login(username, password, { create: mode === 'create' });
  };

  return (
    <div className="min-h-dvh px-5 py-safe flex items-center justify-center bg-[radial-gradient(circle_at_30%_5%,rgba(245,158,11,0.18),transparent_20rem)]">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="glass-card w-full max-w-[420px] p-5"
      >
        <div className="mb-6">
          <div className="w-14 h-14 rounded-3xl bg-primary-500 text-white grid place-items-center text-2xl font-bold shadow-lg shadow-primary-500/25 mb-4">
            A
          </div>
          <h1 className="text-2xl font-bold tracking-tight">选择听书用户</h1>
          <p className="text-sm text-dark-400 mt-2 leading-6">
            每个用户都有独立书库、播放记录、收藏、设置和离线缓存。
          </p>
        </div>

        {users.length > 0 && mode === 'login' && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {users.map((user) => (
              <button
                key={user.username}
                type="button"
                onClick={() => setUsername(user.username)}
                className={`rounded-2xl p-3 text-left transition-all ${
                  username === user.username
                    ? 'bg-primary-500/15 ring-1 ring-primary-500/40'
                    : 'bg-dark-800/40 hover:bg-dark-800/70'
                }`}
              >
                <Avatar user={user} className="w-11 h-11 mb-2" />
                <div className="text-sm font-semibold truncate">{user.username}</div>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <input
            className="field-ios"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            autoComplete="username"
            required
          />
          <input
            className="field-ios"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'create' ? '设置密码' : '输入用户密码'}
            type="password"
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            required
          />
          {error && <div className="text-sm text-red-400 bg-red-500/10 rounded-2xl px-3 py-2">{error}</div>}
          <button className="btn-primary w-full" disabled={isBusy}>
            {isBusy ? '处理中...' : mode === 'create' ? '创建并进入' : '进入书库'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'create' ? 'login' : 'create');
            setPassword('');
          }}
          className="touch-target w-full mt-4 text-sm text-dark-400 hover:text-primary-500"
        >
          {mode === 'create' ? '已有用户，返回登录' : '创建一个新用户'}
        </button>
      </motion.div>
    </div>
  );
}

export function Avatar({ user, className = 'w-10 h-10' }) {
  const initial = user?.username?.slice(0, 1)?.toUpperCase() || 'A';
  return (
    <div className={`${className} rounded-full overflow-hidden bg-primary-500/20 text-primary-500 grid place-items-center font-bold`}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={`${user.username} 头像`} className="w-full h-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
