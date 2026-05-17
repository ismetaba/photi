# Photi backend — Fastify + better-sqlite3 + Drizzle worker.
FROM node:20-alpine AS base
WORKDIR /app

# Native deps for better-sqlite3 / sharp / face-api at build time.
RUN apk add --no-cache python3 make g++ libc6-compat

# Install monorepo-wide deps via pnpm so the backend workspace can import
# @photi/shared.
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared

RUN pnpm install --frozen-lockfile=false --filter backend... --filter shared...

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/photi.db
ENV STORAGE_DIR=/data/storage
ENV MODEL_DIR=/app/apps/backend/public/models

EXPOSE 3000
VOLUME ["/data"]

WORKDIR /app/apps/backend
CMD sh -c "pnpm db:migrate && pnpm start"
