import { Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Bookshelf from './pages/Bookshelf';
import BookDetail from './pages/BookDetail';
import Favorites from './pages/Favorites';
import Settings from './pages/Settings';
import Player from './components/Player';
import BottomNav from './components/BottomNav';
import MiniPlayer from './components/MiniPlayer';
import UserGate from './components/UserGate';

function App() {
  return (
    <UserGate>
      <div className="app-shell relative mx-auto overflow-x-hidden">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Bookshelf />} />
            <Route path="/book/:bookId" element={<BookDetail />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/player" element={<Player />} />
          </Routes>
        </AnimatePresence>
        <MiniPlayer />
        <BottomNav />
      </div>
    </UserGate>
  );
}

export default App;
