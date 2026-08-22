import {
  MatchCategoryMismatchError,
  MissingRequiredFieldError,
  TrophyAwardCompetitionGroupMismatchError,
  TrophyAwardRecipientMismatchError,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/**
 * The subset of an oRPC handler's `errors` object this helper needs: the
 * CONFLICT and BAD_REQUEST constructors. Typed structurally so the helper does
 * not depend on any one contract endpoint's generated error type.
 */
export interface ConflictErrors {
  CONFLICT: (payload: { message: string }) => Error;
  BAD_REQUEST: (payload: { message: string }) => Error;
}

/**
 * One item's outcome in a batch upsert: the flattened entity plus its
 * `created` flag on success, or the domain failure's message on failure.
 * Index-aligned with the request's input array.
 */
export type BatchUpsertItemResult<TEntity extends object> =
  | (TEntity & { success: true; created: boolean })
  | { success: false; error: string };

/**
 * The shared body of every RPC upsert handler: run the service's upsert,
 * flatten the entity and its created flag into the response, and translate
 * known failure modes into the matching contract error. A per-entity conflict
 * (>1 owner matched) becomes CONFLICT; a create-path payload missing a
 * required column (`MissingRequiredFieldError`, shared across every entity,
 * so no per-entity class is needed here) becomes BAD_REQUEST. A match whose
 * category doesn't fit its competition's type (`MatchCategoryMismatchError`)
 * is likewise a payload-validity failure, not a conflict, and also becomes
 * BAD_REQUEST, as does a trophy award whose player id does not fit its
 * trophy's recipient kind (`TrophyAwardRecipientMismatchError`) and one whose
 * competition belongs to a different competition group than its trophy is
 * curated for (`TrophyAwardCompetitionGroupMismatchError`, issue #520).
 * Anything else propagates untouched.
 */
@Injectable()
export class UpsertHandlerService {
  /**
   * The conflict error class is passed in rather than inferred: each entity
   * has its own exported class, and those are public API.
   */
  async run<TEntity extends object>(
    errors: ConflictErrors,
    conflictErrorClass: abstract new (...args: never[]) => Error,
    run: () => Promise<{ entity: TEntity; created: boolean }>,
  ): Promise<TEntity & { created: boolean }> {
    try {
      const { entity, created } = await run();
      return { ...entity, created };
    } catch (err) {
      if (err instanceof conflictErrorClass) {
        throw errors.CONFLICT({ message: err.message });
      }
      if (
        err instanceof MissingRequiredFieldError ||
        err instanceof MatchCategoryMismatchError ||
        err instanceof TrophyAwardRecipientMismatchError ||
        err instanceof TrophyAwardCompetitionGroupMismatchError
      ) {
        throw errors.BAD_REQUEST({ message: err.message });
      }
      throw err;
    }
  }

  /**
   * The batch counterpart of {@link run}: performs each item's upsert in
   * turn and answers with one result per item, in input order. It classifies
   * failures exactly as `run` does, but a known domain failure (this
   * entity's conflict error, `MissingRequiredFieldError`,
   * `MatchCategoryMismatchError`, a trophy award whose player id does not
   * fit its trophy's recipient kind (`TrophyAwardRecipientMismatchError`), a
   * trophy award whose competition is in a different competition group than
   * its trophy (`TrophyAwardCompetitionGroupMismatchError`)) becomes that
   * item's `{success: false}` entry instead of a thrown
   * contract error, so one bad item never costs its siblings their upserts.
   * Anything else still propagates untouched and
   * aborts the whole batch — an unexpected server error is not a per-item
   * data problem, and swallowing it would report a partial import as a
   * complete one.
   *
   * `conflictErrorClass` is `undefined` for `externalSystems`, which matches
   * by name alone and so has no conflict class to catch (mirroring
   * `upsertProcedureWithoutConflict`'s deliberate omission).
   *
   * Items run sequentially: this collapses network round trips only, not the
   * server-side DB round trips, so there is no ordering or concurrency
   * change to reason about here.
   */
  async runBatch<TEntity extends object>(
    conflictErrorClass: (abstract new (...args: never[]) => Error) | undefined,
    items: Array<() => Promise<{ entity: TEntity; created: boolean }>>,
  ): Promise<BatchUpsertItemResult<TEntity>[]> {
    const results: BatchUpsertItemResult<TEntity>[] = [];
    for (const runItem of items) {
      try {
        const { entity, created } = await runItem();
        results.push({ ...entity, success: true as const, created });
      } catch (err) {
        if (
          conflictErrorClass !== undefined &&
          err instanceof conflictErrorClass
        ) {
          results.push({ success: false, error: err.message });
          continue;
        }
        if (
          err instanceof MissingRequiredFieldError ||
          err instanceof MatchCategoryMismatchError ||
          err instanceof TrophyAwardRecipientMismatchError ||
          err instanceof TrophyAwardCompetitionGroupMismatchError
        ) {
          results.push({ success: false, error: err.message });
          continue;
        }
        throw err;
      }
    }
    return results;
  }
}
