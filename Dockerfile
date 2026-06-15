# 构建前端
FROM node:24-alpine AS frontend-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 生产环境
FROM node:24-alpine
WORKDIR /app

# ffmpeg: 音频格式转换  7zip: 解压 zip/7z/rar 等压缩包
RUN apk add --no-cache ffmpeg 7zip

COPY server/package*.json ./server/
RUN cd server && npm ci --production

COPY server/ ./server/
COPY --from=frontend-build /app/client/dist ./client/dist

# 有声书默认存放目录
VOLUME ["/data/audiooook_web"]

ENV NODE_ENV=production
ENV AUDIOBOOK_PATH=/data/audiooook_web
ENV PORT=4001

EXPOSE 4001

CMD ["node", "server/index.js"]
