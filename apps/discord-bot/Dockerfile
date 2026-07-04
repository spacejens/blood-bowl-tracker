FROM node:26-alpine AS builder
WORKDIR /build

RUN npm install -g corepack && corepack enable && corepack prepare pnpm@11.9.0 --activate

# Copy manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/discord-bot/package.json apps/discord-bot/
COPY packages/api-client/package.json packages/api-client/
COPY packages/api-contract/package.json packages/api-contract/
COPY packages/api-server/package.json packages/api-server/
COPY packages/db/package.json packages/db/
COPY packages/discord-client/package.json packages/discord-client/
COPY packages/import/package.json packages/import/
COPY tools/import-bbl/package.json tools/import-bbl/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build


FROM node:26-alpine
WORKDIR /app

RUN npm install -g corepack && corepack enable && corepack prepare pnpm@11.9.0 --activate

# Copy manifests and install only production deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/discord-bot/package.json apps/discord-bot/
COPY packages/api-client/package.json packages/api-client/
COPY packages/api-contract/package.json packages/api-contract/
COPY packages/api-server/package.json packages/api-server/
COPY packages/db/package.json packages/db/
COPY packages/discord-client/package.json packages/discord-client/
COPY packages/import/package.json packages/import/
COPY tools/import-bbl/package.json tools/import-bbl/

RUN pnpm install --frozen-lockfile --prod

# Copy compiled output for the discord-bot and its workspace dependencies
COPY --from=builder /build/apps/discord-bot/dist ./apps/discord-bot/dist
COPY --from=builder /build/packages/api-contract/dist ./packages/api-contract/dist
COPY --from=builder /build/packages/api-server/dist ./packages/api-server/dist
COPY --from=builder /build/packages/db/dist ./packages/db/dist
COPY --from=builder /build/packages/db/migrations ./packages/db/migrations
COPY --from=builder /build/packages/discord-client/dist ./packages/discord-client/dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/discord-bot/dist/main"]
