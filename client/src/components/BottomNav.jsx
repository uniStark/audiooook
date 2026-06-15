import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  HiOutlineBookOpen, 
  HiOutlineHeart, 
  HiOutlineCog6Tooth 
} from 'react-icons/hi2';

const navItems = [
  { path: '/', icon: HiOutlineBookOpen, label: '书架' },
  { path: '/favorites', icon: HiOutlineHeart, label: '收藏' },
  { path: '/settings', icon: HiOutlineCog6Tooth, label: '设置' },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // 播放器全屏时隐藏底部导航
  if (location.pathname === '/player') return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-2 pointer-events-none">
      <div className="mobile-fixed-shell pointer-events-auto">
        <nav
          className="backdrop-blur-xl border px-3 pb-safe rounded-t-[28px]"
          style={{ background: 'var(--surface-card-strong)', borderColor: 'var(--border-soft)' }}
        >
          <div className="flex justify-around items-center h-16">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="touch-target flex flex-1 flex-col items-center justify-center gap-1 relative rounded-2xl px-2 active:scale-95 transition-transform"
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="relative">
                    <Icon className={`w-6 h-6 transition-colors duration-200 ${
                      isActive ? 'text-primary-500' : 'text-dark-400'
                    }`} />
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary-500 rounded-full"
                      />
                    )}
                  </div>
                  <span className={`text-[10px] transition-colors duration-200 ${
                    isActive ? 'text-primary-500 font-medium' : 'text-dark-500'
                  }`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
