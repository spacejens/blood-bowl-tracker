/** Postgres' SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * How many `.cause` links to walk while unwrapping a caught error before
 * giving up. The loop checks the original error plus this many nested
 * `.cause` values (`<=`, not `<`). drizzle-orm's pg-core session wraps
 * exactly one level in practice, so 3 is generous headroom rather than a
 * value tuned to a specific stack.
 */
const MAX_CAUSE_UNWRAP_DEPTH = 3;

/**
 * True only for a unique-constraint violation (SQLSTATE 23505) on
 * `tableName` itself, on a constraint other than that table's primary key.
 *
 * The caught value usually doesn't carry the fields to test. drizzle-orm
 * wraps every query failure in a `DrizzleQueryError` that sets `cause` but
 * copies neither `code` nor `table_name`, so the `postgres` driver's
 * `PostgresError` can only be reached by walking `.cause`, which is bounded
 * here defensively. A bare driver error (e.g. a deferred constraint raised
 * at COMMIT outside drizzle's wrapping) is checked directly before any
 * unwrapping.
 *
 * Matching is on `table_name`, not the constraint name. Postgres truncates
 * identifiers to 63 bytes (`NAMEDATALEN`), and some natural-key constraint
 * names (e.g. `competition_groups_external_ids`') exceed that, so a
 * hand-reconstructed name would silently never match. Callers pass a table
 * whose only unique constraint besides its primary key is the one they are
 * guarding, so the table name identifies the violation unambiguously and
 * survives any constraint rename.
 *
 * The SQLSTATE check stays alongside it so that a different failure on the
 * same table (a NOT NULL violation, say) isn't mistaken for this one. The
 * primary key is excluded for the same reason: a 23505 on `<table>_pkey`
 * (a desynced sequence, say) is an infrastructure bug, not a
 * concurrent-insert race. Comparing `constraint_name` is safe there because
 * `<table>_pkey` is always well under 63 bytes.
 *
 * A loose pure function rather than a service: it is the error classifier
 * for the "generic over entity/table type" upsert helpers (CLAUDE.md
 * exception 1), which cannot receive an injected collaborator.
 */
export function isUniqueViolationOn(
  error: unknown,
  tableName: string,
): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_UNWRAP_DEPTH; depth++) {
    const typed = candidate as
      | {
          code?: unknown;
          table_name?: unknown;
          constraint_name?: unknown;
          cause?: unknown;
        }
      | undefined;
    if (
      typed?.code === UNIQUE_VIOLATION &&
      typed.table_name === tableName &&
      typed.constraint_name !== `${tableName}_pkey`
    ) {
      return true;
    }
    if (typeof typed !== 'object' || typed === null || !('cause' in typed)) {
      return false;
    }
    candidate = typed.cause;
  }
  return false;
}
