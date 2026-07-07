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
