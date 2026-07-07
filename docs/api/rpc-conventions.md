# RPC Conventions

Every procedure in the API is exposed through `packages/api-contract` and
dispatched over [oRPC](https://orpc.dev/)'s native RPC transport (not
REST/OpenAPI), implemented in `packages/api-server`.

## Standard procedures

Most importable entities expose an `upsert` procedure (e.g.
`coaches.upsert`, `externalSystems.upsert`) — see [Imports](imports.md) for
what upsert means and when it's used. An upsert's response is the resulting
record with an added `created` boolean field, distinguishing "a new record
was created" from "an existing record was found and updated" without
relying on a status code.

## Error responses

Procedures declare their possible errors on the oRPC contract itself (see
`packages/api-contract/src/contract.ts`), typed and enforced at compile
time. For example, `coaches.upsert` declares a `CONFLICT` error for when a
request's candidate external IDs match more than one existing record;
nothing is changed in that case. Validation errors (malformed input) are
rejected before reaching application code, per the `zod` schemas in
`packages/api-contract`.
