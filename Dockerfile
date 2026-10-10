
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Dependencies
FROM base AS deps

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Build
FROM deps AS builder

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY src ./src

# Required by Prisma config while generating.
# This is NOT your production database.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"

RUN npx prisma generate

RUN npm run build

# Remove development-only dependencies
RUN npm prune --omit=dev

# Production runtime
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3001
ENV STORAGE_PATH=/app/storage
ENV ENABLE_WHATSAPP_WORKER=false

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/storage/uploads && \
    chown -R node:node /app

USER node

EXPOSE 3001

CMD ["node", "dist/server.js"]

