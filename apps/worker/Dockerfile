FROM node:20-alpine AS base
RUN npm install -g pnpm@9.15.0

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

WORKDIR /app/apps/worker
RUN pnpm build

CMD ["node", "dist/index.js"]
