# API

The tracker's backend logic lives in `packages/game-data`, dispatched by a
thin RPC transport layer in `packages/api-server` (hosted in-process by
`apps/discord-bot`) and described by a shared [oRPC](https://orpc.dev/)
contract in `packages/api-contract`. This section documents general concepts
that apply across the whole API — it does not enumerate every procedure (see
`packages/api-contract/src/contract.ts` for that level of detail).

- [RPC conventions](rpc-conventions.md) — the standard shape procedures
  follow (upsert) and how errors are reported.
- [Imports](imports.md) — how import tools create or update records without
  duplicating them on repeated runs (upsert, external systems, external IDs).

## Packages

### api-contract

`packages/api-contract` is the oRPC contract plus the Zod schemas and inferred
`Upsert*` types for every game entity. It is the single source of truth for
those shapes, and also owns the one MA/ST/AG/PA/AV line type
(`CharacteristicLine`) that importers and `packages/game-data` reuse instead
of restating, and the TP wire shapes `packages/parse-tp`'s output is typed
with.

- Newly imported data must exist in the contract before an importer can send
  it or a consumer can read it.
- A change here reaches `packages/api-server`, `packages/api-client`,
  `packages/game-data`, `packages/import`, `packages/import-shared` and, for
  the TP wire shapes, `packages/parse-tp` and `packages/import-tp-live`
  together.
- Its only workspace dependency is `packages/domain-enums`, which its Zod
  enums are built from. Built only on that and external libraries, it is
  allowed on both sides of the
  [client/server boundary](../architecture.md#clientserver-boundary).

### api-server

`packages/api-server` is a thin NestJS transport layer: it mounts a single
oRPC `RPCHandler` at `/rpc` and dispatches each call into
`packages/game-data`. It is a package, not an app: `apps/discord-bot` hosts it
in-process, and there is no separately deployed api-server process. `/rpc`
requires a bearer token per importer tool (see
[RPC conventions](rpc-conventions.md)).

- It imports `packages/game-data` for persistence and `packages/api-contract`
  for the contract it implements; it has no direct dependency on
  `packages/db`.
- It also imports `packages/import-tp-live` to implement `tpRosters.import`,
  `tpMatches.import`, `tpCompetitions.import` and `tpOfficialTeams.import`
  (see [import-tp-live](../import-tp-live/index.md)).

### api-client

The client side, `packages/api-client`, is documented on its own page:
[api-client](../api-client/index.md).
