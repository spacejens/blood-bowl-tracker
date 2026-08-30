FROM node:24-alpine AS builder
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
COPY packages/game-data/package.json packages/game-data/
COPY packages/import/package.json packages/import/
COPY tools/import-bbl/package.json tools/import-bbl/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build


FROM node:24-alpine
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
COPY packages/game-data/package.json packages/game-data/
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
COPY --from=builder /build/packages/game-data/dist ./packages/game-data/dist

# Identity of the code in this image, surfaced in the bot's startup message.
# `.dockerignore` excludes `.git`, so this cannot be discovered at runtime
# inside the container — it has to be passed in at build time. All default to
# empty; DeploymentInfoService omits an empty field rather than failing.
# GIT_COMMIT_MESSAGE is the raw, possibly multi-line message; the service
# picks the single line to display, using GIT_IS_MERGE_COMMIT ("true"/"false")
# to tell a merge commit's unhelpful subject from its body.
# GIT_COMMIT_TIMESTAMP is the ISO-8601 committer date, which the service
# renders in UTC.
ARG GIT_SHA=""
ARG GIT_BRANCH=""
ARG GIT_COMMIT_MESSAGE=""
ARG GIT_COMMIT_TIMESTAMP=""
ARG GIT_IS_MERGE_COMMIT=""
ENV GIT_SHA=$GIT_SHA
ENV GIT_BRANCH=$GIT_BRANCH
ENV GIT_COMMIT_MESSAGE=$GIT_COMMIT_MESSAGE
ENV GIT_COMMIT_TIMESTAMP=$GIT_COMMIT_TIMESTAMP
ENV GIT_IS_MERGE_COMMIT=$GIT_IS_MERGE_COMMIT

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/discord-bot/dist/main"]
