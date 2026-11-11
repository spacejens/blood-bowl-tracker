# api-client

`packages/api-client` is a NestJS module wrapping an oRPC `RPCLink` client for
calling a deployed api-server's `/rpc` endpoint (see [API](../api/index.md)).
`packages/import` and each `tools/import-*` CLI configure it.

## What it owns

- **Base URL configuration** — its own `@nestjs/config`-backed
  `ApiClientConfigService`, reading `API_BASE_URL` (default
  `http://localhost:3000`).
- **The client bootstrap** — `createApiClient` builds the client as the
  module's `useFactory`, the bootstrap case of `CLAUDE.md`'s "Service vs. loose
  function" (case 3).
- **Resilient transport** — `ResilientFetchService` is the `fetch` it hands to
  `RPCLink`: it bounds each attempt with a timeout and retries
  transport-level failures with exponential backoff. The imports this client
  serves upsert everything they send, so a retried request does not duplicate
  rows. One consequence: when a response is lost after the server committed,
  the retry reports a newly inserted player as already existing, and the TP
  bulk import's lasting-injury history backfill, which only covers players the
  run inserted, then skips that player.

## Rules

- **Client-side only.** Tools reach server-side logic through this package
  rather than importing a server-side package; an app never uses it to call
  the api-server it hosts itself (see the
  [client/server boundary](../architecture.md#clientserver-boundary)).
- **Transport only.** It holds reusable transport plumbing, kept separate from
  the business logic that uses it (see
  [Key decisions](../architecture.md#key-decisions)). Its only workspace
  dependency is `packages/api-contract`.

## Development

```bash
pnpm --filter @blood-bowl-tracker/api-client run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/api-client run verify  # build + lint + typecheck + format + test
```
