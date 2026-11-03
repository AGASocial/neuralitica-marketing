# Neuramark media worker (ADR-0003): Node 24 + FFmpeg, runs the job loops in worker/*.ts.
# The Next.js app itself deploys on Vercel; this image is only for Fly.io worker machines.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# tsx (devDependency) is the runtime loader for worker/*.ts.
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund

COPY tsconfig.json ./
COPY lib ./lib
COPY worker ./worker
COPY messages ./messages

# `react-server` condition lets `server-only` imports resolve outside Next.js.
ENV NODE_OPTIONS="--conditions=react-server --import tsx"
CMD ["node", "worker/video-jobs.ts"]
