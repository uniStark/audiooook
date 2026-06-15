# 🎧 audiooook_web

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Node-24-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/SQLite-多用户-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/FFmpeg-AAC转换-007808?style=flat-square&logo=ffmpeg&logoColor=white" alt="FFmpeg">
  <img src="https://img.shields.io/badge/PWA-离线-5A0FC8?style=flat-square&logo=pwa&logoColor=white" alt="PWA">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

**自托管、多用户的在线有声书播放器 — 放入有声书文件夹，Docker 一键部署，手机即可收听。**

[English](README.md) | [简体中文](README.zh-CN.md)

<p align="center">
  <a href="https://audiooook-demo.vercel.app"><b>🔗 在线 UI 预览 Demo</b></a>
</p>
<p align="center">
  <sub><b>说明：</b>该 Demo 仅为<b>前端界面预览</b>（无后端、无数据）——登录、书库、播放均不可用。完整功能请用 Docker 自托管（见下文）。</sub>
</p>

<p align="center">
  <sub>由 <b>Adrian Stark</b> 用 ❤️ 打造</sub>
</p>

---

## 🎯 功能特性

- **👥 多用户（SQLite 存储）**
  - 每个用户独立的书库、收藏、播放进度、元数据与设置
  - 移动端用户门：选择 / 创建 / 登录 / 切换用户
  - 每台设备一个 30 天 HttpOnly 会话 Cookie，多设备各自登录
  - 支持上传用户头像；所有用户数据存于单个内嵌 SQLite 数据库
  - 旧版单用户 JSON 数据首次启动时自动迁移到默认用户

- **🔒 公网访问密码门**
  - 可选的服务端密码页，用于保护暴露到公网的部署
  - HMAC 签名的访问令牌，浏览器记忆 30 天
  - 通过 `PUBLIC_ACCESS_PASSWORD` 配置（与用户账号相互独立）

- **🎵 多格式音频支持**
  - 浏览器原生播放 MP3、AAC/M4A、WAV、FLAC、OGG、OPUS
  - 服务端 FFmpeg 转换非浏览器原生格式（WMA、APE）
  - WMA/APE 一次性转为 AAC（.m4a）并以静态文件直接播放，无需在线转码

- **📂 智能文件夹解析**
  - 自动识别 `小说名 / 季(章节) / 集` 目录结构
  - 支持中文数字（第一季）和阿拉伯数字（Season 1）
  - 无季结构的单本书（直接放音频文件）也能正常识别
  - 跨季自动连播

- **💾 播放记忆持久化**
  - 精确记录播放位置（书 + 季 + 集 + 秒）
  - 播放中每 10 秒自动保存
  - 继续播放时可配置回退秒数（0–30 秒）
  - 书架上一键继续播放按钮

- **⏭️ 跳过片头片尾**
  - 每本书独立设置跳过时长
  - 设置后全书所有章节生效
  - 各书互不影响

- **📱 离线 & PWA**
  - 整季下载，离线收听
  - 下载进度跟踪，支持取消
  - 可配置缓存大小（50MB–5GB）
  - 添加到主屏幕的安装引导卡片，接近原生 App 体验

- **🎨 现代移动端 UI**
  - 暗色主题 + 毛玻璃效果
  - 丝滑动效（Framer Motion）
  - 底部导航栏（书架 / 收藏 / 设置）
  - 迷你播放条 + 全屏播放器
  - 锁屏控制（Media Session API）

- **📚 书库管理**
  - 书架搜索 + 排序（最近播放 / 名称正序 / 名称倒序）
  - 收藏功能
  - 自定义书名、简介、封面上传
  - 支持以文件、文件夹、压缩包（ZIP/7Z/RAR/TAR.GZ）方式上传书籍
  - UI 中浏览服务器目录并选择有声书路径

- **⚡ 智能转换引擎**
  - 检测到新书含 WMA/APE 时，自动转换为 AAC（.m4a，64kbps 单声道）
  - 转换后替换原文件 — 体积减半，人声音质相当或更好
  - 动态并发（最高 CPU 核数 / 2，上限 10）
  - CPU / 内存超 85% 时自动暂停，防止服务器宕机
  - 书架与详情页展示每本书的转换进度

---

## 🚀 快速开始

### 环境要求

- Docker（推荐用于部署）— 镜像已内置 FFmpeg、7zip 与 Node 24
- 本地开发：**Node.js 24+**（内置 `node:sqlite` 模块所需）与 FFmpeg

### 方案一：Docker Compose（推荐）

```bash
git clone https://github.com/uniStark/audiooook.git
cd audiooook

# 可选：创建 .env 覆盖默认配置（见下），然后：
docker compose up -d --build

# 访问 http://localhost:3003
```

`docker-compose.yml` 支持以下 `.env` 覆盖项：

```bash
# .env
AUDIOBOOK_HOST_PATH=/srv/audiobooks                      # 宿主机有声书库挂载路径
PUBLIC_ACCESS_PASSWORD=your-strong-password              # 公网访问密码
```

默认情况下，书库从 `./data/audiobooks` 挂载，持久化数据（SQLite 数据库、封面、各用户文件）存于 `./data`。

### 方案二：Docker 命令

```bash
docker build -t audiooook_web .

# 将宿主机目录以同路径挂载进容器，确保 UI 浏览路径一致
docker run -d -p 3003:4001 \
  -v /nas:/nas \
  -v ./data:/app/server/data \
  -e AUDIOBOOK_PATH=/nas/books \
  -e PUBLIC_ACCESS_PASSWORD=your-strong-password \
  --name audiooook_web audiooook_web
```

> **注意**：挂载的宿主机目录在容器内保持同路径（如 `-v /nas:/nas`），这样 UI 中浏览和选择的目录路径在容器内外一致。支持多目录挂载：`-v /nas:/nas -v /mnt/media:/mnt/media`

### 方案三：本地开发

```bash
# 安装所有依赖（根目录 + 服务端 + 前端）
npm run install:all

# 启动开发环境（前后端并行）
npm run dev

# 前端: http://localhost:4001
# 后端: http://localhost:5001
```

### 首次登录

服务首次启动时会播种一个默认用户：

| 用户名  | 密码    |
|---------|---------|
| `admin` | `admin` |

默认用户（`admin`）拥有通过 `AUDIOBOOK_PATH` 挂载的书库；其他用户拥有各自独立的书库，位于 `server/data/users/<用户名>/audiobooks/`。
首次登录后请修改默认凭据，并为公网部署设置强 `PUBLIC_ACCESS_PASSWORD`。

---

## 📂 有声书目录结构

```
audiobooks/
├── 盗墓笔记/                              ← 小说名（自动识别为书名）
│   ├── cover.jpg                          ← 封面图片（可选）
│   ├── 盗墓笔记1之七星鲁王宫(周建龙)[42回]/  ← 第一季
│   │   ├── 盗墓笔记1-七星鲁王宫01.wma
│   │   ├── 盗墓笔记1-七星鲁王宫02.wma
│   │   └── ...
│   ├── 盗墓笔记2之怒海潜沙(周建龙)[40回]/    ← 第二季
│   │   └── ...
│   └── ...
├── 鬼吹灯/
│   ├── 第一季/
│   │   └── 01.mp3 ...
│   └── 第二季/
│       └── ...
└── 三体/                                  ← 也支持无季结构（直接放音频文件）
    ├── 三体01.mp3
    └── ...
```

---

## 📂 项目结构

```
audiooook_web/
├── client/                      # React 前端（Vite）
│   ├── src/
│   │   ├── components/          # BookCard, BottomNav, EpisodeList, MiniPlayer,
│   │   │                        #   Player, UserGate, PwaInstallCard
│   │   ├── pages/               # Bookshelf, BookDetail, Favorites, Settings
│   │   ├── stores/              # Zustand 状态管理（player, book, download, session）
│   │   ├── hooks/               # usePwaInstallPrompt
│   │   └── utils/               # API 客户端, IndexedDB + 服务端同步, 格式化工具
│   └── vite.config.js
├── server/                      # Express 后端
│   ├── db/                      # appDb.js — SQLite 表结构、用户/会话/数据
│   ├── middleware/              # publicAccess（密码门）、userContext（按用户隔离）
│   ├── routes/                  # books, audio, config, user, upload, session
│   ├── services/                # scanner, converter（WMA/APE→AAC）, oss
│   ├── utils/                   # parser, paths, accessAuth
│   └── data/                    # 运行时数据（SQLite 数据库、封面、各用户目录）
├── Dockerfile                   # 多阶段构建（Node 24 + FFmpeg + 7zip）
├── docker-compose.yml           # 生产环境容器配置
├── .gitattributes               # 强制 LF 换行符
└── PROJECT_CONTEXT.md           # AI 友好的项目全量文档
```

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18、Vite 6、Tailwind CSS、Zustand、Framer Motion、React Router DOM 7 |
| **后端** | Node.js 24、Express 4、内置 `node:sqlite`、FFmpeg（音频转换） |
| **存储** | SQLite（用户、会话、收藏、进度、元数据）+ 文件系统（音频、封面、头像） |
| **离线** | IndexedDB（`idb`）、Service Worker、VitePWA |
| **图标** | react-icons（Heroicons v2） |
| **部署** | Docker、Docker Compose V2 |

---

## ⚙️ 配置说明

### 端口配置

| 环境 | 前端 | 后端 | 访问地址 |
|------|------|------|---------|
| 开发环境 | 4001 (Vite) | 5001 (Express) | http://localhost:4001 |
| Docker | —（静态文件） | 4001（容器内） | http://宿主机:3003 |

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | 开发: `5001` / Docker: `4001` |
| `NODE_ENV` | 运行环境 | `production`（Docker） |
| `AUDIOBOOK_PATH` | 默认用户的有声书目录 | `/data/audiooook_web`（生产）/ `./audiobooks`（开发） |
| `AUDIOBOOK_HOST_PATH` | 作为书库挂载的宿主机路径（compose） | `./data/audiobooks` |
| `DEFAULT_USER_AUDIOBOOK_PATH` | 单独覆盖默认用户的书库路径 | 回退到 `AUDIOBOOK_PATH` |
| `PUBLIC_ACCESS_PASSWORD` | 公网访问密码 | `audiooook` |
| `PUBLIC_ACCESS_SECRET` | 访问令牌签名密钥 | 访问密码 |
| `AUDIOOOOK_DB_PATH` | 覆盖 SQLite 数据库文件位置 | `server/data/audiooook.sqlite` |
| `TZ` | 日志时间戳时区 | `Asia/Shanghai` |
| `OSS_REGION` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET` / `OSS_PREFIX` | 阿里云 OSS（可选） | — |

### 访问控制（两层）

1. **公网访问密码门**（`/api/auth`）— 服务端渲染的密码页，守护整个站点，用于暴露到公网的部署。
   验证通过的浏览器通过签名的 `audiooook_access` Cookie 记忆 30 天。
2. **用户会话**（`/api/session`）— 通过密码门后，用户在应用内 `UserGate` 选择账号（或创建新账号）。
   30 天 HttpOnly 的 `audiooook_user_session` Cookie 将每个 API 调用限定到该用户的数据。

### 数据持久化（Docker）

所有持久化数据存储在 `./data`（挂载到容器内 `/app/server/data`）：

| 文件 / 目录 | 内容 |
|-------------|------|
| `audiooook.sqlite` | 用户、会话、设置、收藏、进度、书籍元数据（按用户隔离） |
| `config.json` | 服务器设置（有声书路径、缓存大小） |
| `covers/` | 默认 / 旧版封面图片 |
| `users/<用户名>/audiobooks/` | 各用户上传的书库（默认用户使用全局挂载目录） |
| `users/<用户名>/covers/` | 各用户的自定义封面 |
| `users/<用户名>/profile/` | 各用户的头像 |

> **重要**：更新时请勿删除 `./data` 目录 — 其中保存着所有用户账号与播放进度。
> 安全更新方式：`docker compose up -d --build`（或加 `--no-cache` 强制全新重建）。

> **迁移说明**：旧版单用户安装的 `metadata.json` / `user-data.json` 会在首次启动时
> 自动导入 SQLite 数据库（归入默认用户），随后不再使用。

---

## 🔗 仓库地址

- **GitHub**: https://github.com/uniStark/audiooook

---

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feature/AmazingFeature`）
3. 提交更改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 打开一个 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证。

---

<p align="center">
  <sub>由 <b>Adrian Stark</b> 用 ❤️ 打造</sub>
</p>

**[⬆ 返回顶部](#-audiooook_web)**
