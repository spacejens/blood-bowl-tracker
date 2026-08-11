# RPC Conventions

Every procedure in the API is exposed through `packages/api-contract` and
dispatched over [oRPC](https://orpc.dev/)'s native RPC transport (not
REST/OpenAPI), implemented in `packages/api-server`.

## Authentication

Every `/rpc` request must carry an `Authorization: Bearer <token>` header. The
server (`packages/api-server`) accepts one token per known network caller —
`tools/import-bbl`, `tools/import-tp`, and `tools/import-manual` — configured
as the `API_TOKEN_IMPORT_BBL`, `API_TOKEN_IMPORT_TP`, and
`API_TOKEN_IMPORT_MANUAL` environment variables of the hosting
`apps/discord-bot` process (see [discord-bot](../discord-bot/index.md)).
`apps/discord-bot` itself needs no token: its own commands call
`packages/game-data` in-process, never over HTTP.

A request with no header, a malformed header, or a token matching no
configured caller is rejected before it reaches any procedure, with HTTP `401`
and the body `{"error":"Unauthorized"}`. This is authentication only: every
authenticated caller can invoke every procedure. Tokens are compared in
constant time, and rejections are logged at warn level (the caller is unknown
by definition, so only the method and path are logged).

Callers send the header through `packages/api-client`:
`createApiClient(baseUrl, apiToken)` attaches
`Authorization: Bearer <apiToken>` to every request, and
`ApiClientModule.forRootAsync`'s factory supplies both values from the tool's
own config (`connection.apiBaseUrl` and `connection.apiToken`).

## Standard procedures

Most importable entities expose an `upsert` procedure (e.g.
`coaches.upsert`, `externalSystems.upsert`) — see [Imports](imports.md) for
what upsert means and when it's used. An upsert's response is the resulting
record with an added `created` boolean field, distinguishing "a new record
was created" from "an existing record was found and updated" without
relying on a status code.

Every entity that exposes `upsert` also exposes `upsertBatch`, which takes a
non-empty array of the same inputs and answers with an array of per-item
results, index-aligned with the request. Batching exists because the import
tools otherwise make one network round trip per record — hours of wall-clock
time on a full production import. It collapses network round trips only: the
server still performs one database upsert per item, sequentially, in input
order.

A per-item result is either `{ "success": true, …the record…, "created":
<bool> }` or `{ "success": false, "error": "<message>" }`. Batch procedures
therefore declare no `CONFLICT` or `BAD_REQUEST` contract errors: those
failure modes are per-item, so one bad item never costs its siblings their
upserts. An unexpected server error is not downgraded that way — it is thrown
as a normal RPC error and fails the whole batch, because a partial import
must never be reported as a complete one.

## Error responses

Procedures declare their possible errors on the oRPC contract itself (see
`packages/api-contract/src/contract.ts`), typed and enforced at compile
time. For example, `coaches.upsert` declares a `CONFLICT` error for when a
request's candidate external IDs match more than one existing record;
nothing is changed in that case. Validation errors (malformed input) are
rejected before reaching application code, per the `zod` schemas in
`packages/api-contract`.

Batch procedures move these domain failures into the per-item `error` string
instead (see above); validation of the array itself — including its
non-empty requirement — still happens before application code runs.
