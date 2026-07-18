/**
 * Shared marker base class for every game-data upsert conflict error.
 *
 * The 11 per-entity subclasses (TeamUpsertConflictError, …) stay distinct
 * because the RPC layer catches them by name via `instanceof`. This base
 * carries no message-building logic — that lives once in
 * `upsertByExternalIds`. It exists only so callers can catch "any upsert
 * conflict" and to document the hierarchy. Kept internal to this package
 * (not re-exported from index.ts), like resolve-existing-by-external-ids.ts.
 */
export class UpsertConflictError extends Error {}
