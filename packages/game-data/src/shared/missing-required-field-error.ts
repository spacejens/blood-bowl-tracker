/**
 * Thrown by `upsertByExternalIds` when a payload lands on the *insert* path
 * (its external IDs matched no existing row) without supplying every column
 * the entity table requires.
 *
 * Deliberately a single shared class, not a per-entity subclass like
 * `UpsertConflictError`: nothing in the RPC layer catches this by entity
 * identity. It always signals a payload-construction bug — an importer or
 * manual data entry that was meant to overlay an existing row, whose external
 * IDs failed to match, and which does not carry enough data to create one.
 *
 * Re-exported from index.ts (unlike upsert-conflict-error.ts's per-entity
 * subclasses, which stay package-internal): `packages/api-server`'s
 * `UpsertHandlerService` needs to catch it by `instanceof` to map it onto the
 * contract's BAD_REQUEST error.
 */
export class MissingRequiredFieldError extends Error {}
