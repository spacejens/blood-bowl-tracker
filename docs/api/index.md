# API

The tracker's backend logic lives in `packages/api-server` (a NestJS module
currently consumed directly by `apps/discord-bot`, though that may change in
the future) and is described by a shared [ts-rest](https://ts-rest.com/) contract in
`packages/api-contract`. This section documents general concepts that apply
across the whole API — it does not enumerate every entity type or operation
(see the generated OpenAPI/Swagger docs, when added, for that level of
detail).

- [REST conventions](rest-conventions.md) — the standard shapes every entity's
  endpoints follow (list, get by id, create) and how errors are reported.
- [Imports](imports.md) — how import tools create or update records without
  duplicating them on repeated runs (upsert, external systems, external IDs).
