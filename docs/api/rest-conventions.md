# REST Conventions

Every entity in the API is exposed through `packages/api-contract` following
a small set of standard shapes, implemented in `packages/api-server`.

## Standard endpoints

Most entities expose:

- `GET /<entity>` — list all records.
- `GET /<entity>/:id` — get one record by id; responds `404` with
  `{ message: string }` if it doesn't exist.
- `POST /<entity>` — create a record from a request body; responds `201`
  with the created record.

Some entities additionally expose an `upsert` operation — see
[Imports](imports.md) for what that means and when it's used instead of, or
alongside, plain `create`.

## Error responses

Error responses are a JSON object with a single `message` field:
`{ "message": "..." }`. Validation errors (malformed request bodies) are
rejected before reaching application code, per the `zod` schemas in
`packages/api-contract`.

## Status codes

- `200` — a `GET` succeeded, or an upsert found and updated an existing
  record.
- `201` — a `POST` created a new record (via `create` or via `upsert`).
- `404` — a `GET /<entity>/:id` found no matching record.
- `409` — an upsert's candidate identifiers matched more than one existing
  record; nothing was changed.
