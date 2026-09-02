import {
  CharacteristicFormatMismatchError,
  MatchCategoryMismatchError,
  MissingRequiredFieldError,
  TrophyAwardCompetitionGroupMismatchError,
  TrophyAwardRecipientMismatchError,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/**
 * The BAD_REQUEST constructor from an oRPC handler's `errors` object — the
 * only one an upsert with no CONFLICT case can use. Typed structurally so
 * the helper does not depend on any one contract endpoint's generated error
 * type.
 */
export interface BadRequestErrors {
  BAD_REQUEST: (payload: { message: string }) => Error;
}

/**
 * The subset of an oRPC handler's `errors` object the conflict-aware
 * {@link UpsertHandlerService.run} needs: BAD_REQUEST plus CONFLICT.
 */
export interface ConflictErrors extends BadRequestErrors {
  CONFLICT: (payload: { message: string }) => Error;
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
 * so no per-entity class is needed here) becomes BAD_REQUEST.
 * Characteristics that disagree with what their rules set declares
 * (`CharacteristicFormatMismatchError`, raised by `players.upsert`) are
 * likewise authored-data feedback rather than a server fault, so they become
 * BAD_REQUEST too — matching how `positionRulesSets.sync` already reports the
 * same failure.
 * A match whose category doesn't fit its competition's type (`MatchCategoryMismatchError`)
 * is likewise a payload-validity failure, not a conflict, and also becomes
 * BAD_REQUEST, as does a trophy award whose player id does not fit its
 * trophy's recipient kind (`TrophyAwardRecipientMismatchError`) and one whose
 * competition belongs to a different competition group than its trophy is
 * curated for (`TrophyAwardCompetitionGroupMismatchError`).
 * Anything else propagates untouched.
 * {@link runWithoutConflict} is the same body minus the CONFLICT branch, for
 * an entity whose natural key is enforced by a database constraint.
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
      return await this.runWithoutConflict(errors, run);
    } catch (err) {
      if (err instanceof conflictErrorClass) {
        throw errors.CONFLICT({ message: err.message });
      }
      throw err;
    }
  }

  /**
   * {@link run} for an entity whose contract declares no CONFLICT error,
   * because its natural key is enforced by a database constraint and so can
   * never match more than one row. `trophyAwards.upsert` is the only caller:
   * its unique constraint (see packages/db/src/schema/trophy-awards.ts) makes
   * an ambiguous match impossible, but it can still reject a payload whose
   * player id does not fit the trophy's recipient kind, so BAD_REQUEST
   * remains. Deliberately a distinct method rather than an optional
   * `conflictErrorClass`, so the omission is visible at every call site.
   */
  async runWithoutConflict<TEntity extends object>(
    errors: BadRequestErrors,
    run: () => Promise<{ entity: TEntity; created: boolean }>,
  ): Promise<TEntity & { created: boolean }> {
    try {
      const { entity, created } = await run();
      return { ...entity, created };
    } catch (err) {
      if (
        err instanceof MissingRequiredFieldError ||
        err instanceof CharacteristicFormatMismatchError ||
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
          err instanceof CharacteristicFormatMismatchError ||
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
