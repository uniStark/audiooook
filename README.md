# 🎧 audiooook_web

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Node-24-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/SQLite-Multi--User-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/FFmpeg-AAC%20Convert-007808?style=flat-square&logo=ffmpeg&logoColor=white" alt="FFmpeg">
  <img src="https://img.shields.io/badge/PWA-Offline-5A0FC8?style=flat-square&logo=pwa&logoColor=white" alt="PWA">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

**A self-hosted, multi-user audiobook player web app designed for mobile — drop your audiobook folders, deploy via Docker, and start listening on your phone.**

[English](README.md) | [简体中文](README.zh-CN.md)

<p align="center">
  <a href="https://audiooook-demo.vercel.app"><b>🔗 Live UI Demo</b></a>
</p>
<p align="center">
  <sub><b>Note:</b> the demo is a <b>front-end preview only</b> (no backend, no data) — login, library, and playback are disabled. Run the full app via Docker (see below).</sub>
</p>

<p align="center">
  <sub>Built with ❤️ by <b>Adrian Stark</b></sub>
</p>

---

## 🎯 Features

- **👥 Multi-User (SQLite-backed)**
  - Per-user isolated library, favorites, progress, metadata, and settings
  - Choose / create / login / switch users from a mobile-first gate screen
  - 30-day HttpOnly session cookie per device — each device logs in independently
  - Per-user avatar upload; data stored in a single embedded SQLite database
  - Legacy single-user JSON data is auto-migrated to the default user on first boot

- **🔒 Public Access Gate**
  - Optional server-side password page to protect an internet-exposed deployment
  - HMAC-signed access token, remembered 30 days per browser
  - Configurable via `PUBLIC_ACCESS_PASSWORD` (independent from user accounts)

- **🎵 Multi-Format Audio Support**
  - Plays MP3, AAC/M4A, WAV, FLAC, OGG, OPUS natively
  - Server-side FFmpeg conversion for non-browser-native formats (WMA, APE)
  - WMA/APE are converted **once** to AAC (.m4a) and served as plain static files — no on-demand transcoding

- **📂 Smart Folder Parsing**
  - Auto-recognizes `Novel Name / Season (Chapter) / Episode` structure
  - Supports Chinese numerals (第一季) and Arabic numerals (Season 1)
  - Single-season books (flat audio files) handled gracefully
  - Auto-play across season boundaries

- **💾 Persistent Playback Memory**
  - Remembers exact position (book + season + episode + second)
  - Auto-save every 10 seconds during playback
  - Resume with configurable rewind (0–30s) for context
  - Quick resume button on bookshelf — one tap to continue

- **⏭️ Skip Intro & Outro**
  - Per-book customizable skip duration
  - Applies globally to all episodes of a book
  - Independent settings for each book

- **📱 Offline & PWA**
  - Download entire seasons for offline listening
  - Download progress tracking with cancel support
  - Configurable cache size (50MB–5GB)
  - Add-to-home-screen install prompt for a native-like experience

- **🎨 Modern Mobile UI**
  - Dark theme with glassmorphism design
  - Smooth animations (Framer Motion)
  - Bottom navigation (Bookshelf / Favorites / Settings)
  - Mini player bar with full-screen player view
  - Lock-screen controls via Media Session API

- **📚 Library Management**
  - Bookshelf with search and sorting (Recent / A→Z / Z→A)
  - Favorites collection
  - Custom book name, description, and cover image upload
  - Upload books as files, folders, or archives (ZIP/7Z/RAR/TAR.GZ)
  - Server directory browser for audiobook path selection

- **⚡ Smart Conversion Engine**
  - Auto-converts WMA/APE to AAC (.m4a, 64kbps mono) when a book is first detected
  - Originals are replaced after conversion — half the size, equal-or-better voice quality
  - Dynamic concurrency (up to CPU cores / 2, max 10)
  - CPU/memory safeguard — pauses when system load exceeds 85%
  - Per-book progress shown on the bookshelf and detail page

---

## 🚀 Quick Start

### Prerequisites

- Docker (recommended for deployment) — image bundles FFmpeg, 7zip, and Node 24
- For local development: **Node.js 24+** (required for the built-in `node:sqlite` module) and FFmpeg

### Option 1: Docker Compose (recommended)

```bash
git clone https://github.com/uniStark/audiooook.git
cd audiooook

# Optional: create a .env to override defaults (see below), then:
docker compose up -d --build

# Access at http://localhost:3003
```

`docker-compose.yml` supports these `.env` overrides:

```bash
# .env
AUDIOBOOK_HOST_PATH=/srv/audiobooks                      # host audiobook library mount
PUBLIC_ACCESS_PASSWORD=your-strong-password              # public access gate password
```

By default the library is bind-mounted from `./data/audiobooks` and persistent data
(SQLite DB, covers, per-user files) lives in `./data`.

### Option 2: Docker CLI

```bash
docker build -t audiooook_web .

# Mount host directory at the same path for consistent UI browsing
docker run -d -p 3003:4001 \
  -v /nas:/nas \
  -v ./data:/app/server/data \
  -e AUDIOBOOK_PATH=/nas/books \
  -e PUBLIC_ACCESS_PASSWORD=your-strong-password \
  --name audiooook_web audiooook_web
```

> **Note**: Mount host directories at the **same path** inside the container (e.g., `-v /nas:/nas`) so the UI directory browser shows consistent paths. Multiple mounts supported: `-v /nas:/nas -v /mnt/media:/mnt/media`

### Option 3: Local Development

```bash
# Install all dependencies (root + server + client)
npm run install:all

# Start dev environment (frontend + backend concurrently)
npm run dev

# Frontend: http://localhost:4001
# Backend:  http://localhost:5001
```

### First Login

The server seeds a default user on first boot:

| Username | Password |
|----------|----------|
| `admin`  | `admin`  |

The default user (`admin`) owns the audiobook library mounted via `AUDIOBOOK_PATH`.
Additional users get their own isolated library under `server/data/users/<username>/audiobooks/`.
Change these credentials after first login, and set a strong `PUBLIC_ACCESS_PASSWORD` for public deployments.

---

## 📂 Audiobook Directory Structure

```
audiobooks/
├── Tomb Raiders/                        ← Book name (auto-detected)
│   ├── cover.jpg                        ← Cover image (optional)
│   ├── Season 1 - Seven Star Palace/    ← Season 1
│   │   ├── episode01.wma
│   │   ├── episode02.wma
│   │   └── ...
│   ├── Season 2 - Angry Sea/            ← Season 2
│   │   └── ...
│   └── ...
├── Three-Body Problem/                  ← Single-season book (no subdirs)
│   ├── 01.mp3
│   ├── 02.mp3
│   └── ...
└── Ghost Blows Out the Light/
    ├── 第一季/                           ← Chinese season names supported
    │   └── ...
    └── 第二季/
        └── ...
```

---

## 📂 Project Structure

```
audiooook_web/
├── client/                      # React frontend (Vite)
│   ├── src/
│   │   ├── components/          # BookCard, BottomNav, EpisodeList, MiniPlayer,
│   │   │                        #   Player, UserGate, PwaInstallCard
│   │   ├── pages/               # Bookshelf, BookDetail, Favorites, Settings
│   │   ├── stores/              # Zustand stores (player, book, download, session)
│   │   ├── hooks/               # usePwaInstallPrompt
│   │   └── utils/               # API client, IndexedDB + server sync, formatters
│   └── vite.config.js
├── server/                      # Express backend
│   ├── db/                      # appDb.js — SQLite schema, users/sessions/data
│   ├── middleware/              # publicAccess (password gate), userContext (per-user)
│   ├── routes/                  # books, audio, config, user, upload, session
│   ├── services/                # scanner, converter (WMA/APE→AAC), oss
│   ├── utils/                   # parser, paths, accessAuth
│   └── data/                    # Runtime data (SQLite DB, covers, per-user dirs)
├── Dockerfile                   # Multi-stage build (Node 24 + FFmpeg + 7zip)
├── docker-compose.yml           # Production container config
├── .gitattributes               # Force LF line endings
└── PROJECT_CONTEXT.md           # Comprehensive AI-oriented project docs
```

---

## 🛠️ Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite 6, Tailwind CSS, Zustand, Framer Motion, React Router DOM 7 |
| **Backend** | Node.js 24, Express 4, built-in `node:sqlite`, FFmpeg (audio conversion) |
| **Storage** | SQLite (users, sessions, favorites, progress, metadata) + filesystem (audio, covers, avatars) |
| **Offline** | IndexedDB (`idb`), Service Worker, VitePWA |
| **Icons** | react-icons (Heroicons v2) |
| **Deployment** | Docker, Docker Compose V2 |

---

## ⚙️ Configuration

### Port Configuration

| Environment | Frontend | Backend | Access URL |
|------------|----------|---------|------------|
| Development | 4001 (Vite) | 5001 (Express) | http://localhost:4001 |
| Docker | — (static) | 4001 (internal) | http://host:3003 |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | Dev: `5001` / Docker: `4001` |
| `NODE_ENV` | Environment | `production` (Docker) |
| `AUDIOBOOK_PATH` | Default user's audiobook directory | `/data/audiooook_web` (prod) / `./audiobooks` (dev) |
| `AUDIOBOOK_HOST_PATH` | Host path bind-mounted as the library (compose) | `./data/audiobooks` |
| `DEFAULT_USER_AUDIOBOOK_PATH` | Override the default user's library specifically | falls back to `AUDIOBOOK_PATH` |
| `PUBLIC_ACCESS_PASSWORD` | Public access gate password | `audiooook` |
| `PUBLIC_ACCESS_SECRET` | Secret for signing the access token | the access password |
| `AUDIOOOOK_DB_PATH` | Override SQLite database file location | `server/data/audiooook.sqlite` |
| `TZ` | Timezone for log timestamps | `Asia/Shanghai` |
| `OSS_REGION` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET` / `OSS_PREFIX` | Alibaba Cloud OSS (optional) | — |

### Access Control (two layers)

1. **Public access gate** (`/api/auth`) — a server-rendered password page guarding the
   whole site, intended for internet-exposed deployments. Verified browsers are remembered
   for 30 days via a signed `audiooook_access` cookie.
2. **User session** (`/api/session`) — after passing the gate, a user picks an account
   (or creates one) from the in-app `UserGate`. A 30-day HttpOnly `audiooook_user_session`
   cookie scopes every API call to that user's data.

### Data Persistence (Docker)

All persistent data is stored in `./data` (bind-mounted to `/app/server/data`):

| File / Directory | Content |
|-----------------|---------|
| `audiooook.sqlite` | Users, sessions, settings, favorites, progress, book metadata (per-user) |
| `config.json` | Server settings (audiobook path, cache size) |
| `covers/` | Default/legacy cover images |
| `users/<username>/audiobooks/` | Per-user uploaded library (default user uses the global mount) |
| `users/<username>/covers/` | Per-user custom covers |
| `users/<username>/profile/` | Per-user avatar |

> **Important**: Never delete `./data` during updates — it holds all user accounts and progress.
> Update safely with `docker compose up -d --build` (or `--no-cache` to force a clean rebuild).

> **Migration note**: Legacy `metadata.json` / `user-data.json` from older single-user
> installs are automatically imported into the SQLite database (under the default user)
> on first boot, then left untouched.

---

## 🔗 Repositories

- **GitHub**: https://github.com/uniStark/audiooook

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

<p align="center">
  <sub>Made with ❤️ by <b>Adrian Stark</b></sub>
</p>

**[⬆ Back to Top](#-audiooook_web)**
