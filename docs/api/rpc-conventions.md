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

Most entities that expose `upsert` also expose `upsertBatch`, which takes a
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

A handful of entities deliberately expose `upsert` without `upsertBatch`. The
reason is always the same shape of reason: the entity is a small, low-volume
dataset — often hand-curated, sometimes just naturally small — so collapsing
round trips would save nothing worth the extra procedure. Which entities those
are shifts as the data model grows, so
this document does not name them — each exempt router carries its own comment
in `packages/api-contract/src/contract.ts` explaining why that particular
entity is exempt.

**Standard entity routes are built, not written.** `RpcRouterFactoryService`
composes each entity's block from `buildUpsertRoute`, `buildUpsertBatchRoute`,
`buildResolveRoute` and `buildResolveBatchRoute`; an entity whose contract is
exactly those four procedures uses the composite `buildStandardEntityRoutes`
instead. An entity that adds a procedure (`positions.syncRaceEras`,
`matches.resolveOutcomes`, the players SPP-adjustment syncs,
`competitionGroups.list`) spreads only the builders that apply and
hand-writes the rest, so the extra procedure stays visible at its own block.
`sppAwardValues`, `trophyAwards` and `externalSystems` stay fully
hand-written — they use a different upsert handler method or return a
different result shape, and each carries a comment saying so. Those
permanently hand-written blocks, plus the players SPP-sync procedures,
`positions.syncRaceEras`, `matches.resolveOutcomes` and
`competitionGroups.list`, live in
`rpc-router-factory-hand-written-routes.ts`, which `build()` calls into
directly, keeping `rpc-router-factory.service.ts` itself under its line
budget.

## Reference resolution

Nine entity kinds — coaches, leagues, races, positions, rules sets, eras,
competitions, competition groups and teams — additionally expose `resolve`
and `resolveBatch`. These answer "which record does this
`(external system, identifier)` pair name?" without writing anything:
`resolve` takes one pair, `resolveBatch` a non-empty array of pairs and
answers with an index-aligned array.

An answer is `{ "found": true, "id": <number> }` or `{ "found": false }`.
A miss is never an error. An unresolved reference is an expected outcome —
a typo in a hand-authored data file, or a reference to a record no import
step has created yet — and the caller decides what it means (the import
tools record one `ImportError` and skip the entry). Both procedures
therefore declare no contract errors at all.

This is the read-only half of the lookup every `upsert` already performs
internally to find an existing record, exposed as its own capability. It
replaces the in-memory, same-run-only reference maps the import tools used
to build: because every `upsert` persists immediately, any record created
earlier — in this run, an earlier phase, or a different tool entirely — is
already resolvable.

Matches, players, match events, trophies, trophy awards, SPP award values
and external systems deliberately have no resolve procedure: nothing
references them by external id across files, phases or tools.

## Other procedures

Not every procedure is upsert-shaped. Some entities instead — or in addition —
expose a custom procedure that recomputes or syncs already-imported data in
place rather than importing new records — `sppAwardValues.sync`,
`matches.resolveOutcomes`,
`positions.syncRaceEras` and
`players.syncScrapedSppAdjustments`/`syncReportedSppAdjustments` are current
examples of the pattern, not an exhaustive list. Because nothing is being newly
identified or created, these have no external-id conflict to detect and no
`created` boolean to return: they answer with what was actually written — at
minimum the resulting row or record ids, occasionally alongside a small
summary of what changed. Where the recomputation can fail for individual
entries, those failures come back in the same response rather than as a thrown
error, so one bad entry never costs its siblings their results;
`matches.resolveOutcomes` reports which matches it could not resolve an
outcome for, rather than throwing. As with the batching exceptions above, the
router's own comment and result schema in
`packages/api-contract/src/contract.ts` explain why a given procedure is
shaped this way instead of as an upsert, and its exact result shape.

`positions.syncRaceEras` is the one procedure in this group that declares a
`BAD_REQUEST`: an entry may carry the position's characteristics for that
race era, and characteristics that disagree with the named rules set's
declared formats (a Passing value for a rules set that has none, or a missing
one where the rules set requires it) are authored-data feedback the importer
reports, not a server fault.

A procedure may also be plainly read-only, existing because a caller needs data
that no `upsert` call's input or output can give it. `competitionGroups.list`
is the current example: `tools/import-tp` already holds a competition's
`competitionGroupId` from its own competition upsert's response, but needs that
group's curated _name_ to build a trophy's TP external id — and `upsert` cannot
answer that, because the name is the input it was given. Such a procedure
writes nothing, and declares no contract errors.

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
