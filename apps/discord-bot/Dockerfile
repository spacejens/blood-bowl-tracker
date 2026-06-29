FROM node:24-alpine AS builder
WORKDIR /build

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# Copy manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/discord-bot/package.json apps/discord-bot/
COPY packages/api-client/package.json packages/api-client/
COPY packages/api-contract/package.json packages/api-contract/
COPY packages/api-server/package.json packages/api-server/
COPY packages/db/package.json packages/db/
COPY packages/import/package.json packages/import/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# Create a standalone deployment directory with only production deps
RUN pnpm --filter @blood-bowl-tracker/discord-bot deploy --prod --legacy /deploy


FROM node:24-alpine
WORKDIR /app

COPY --from=builder /deploy ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main"]
