import { MissingRequiredFieldError } from '@blood-bowl-tracker/game-data';
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
 * The shared body of every RPC upsert handler: run the service's upsert,
 * flatten the entity and its created flag into the response, and translate
 * known failure modes into the matching contract error. A per-entity conflict
 * (>1 owner matched) becomes CONFLICT; a create-path payload missing a
 * required column (`MissingRequiredFieldError`, shared across every entity,
 * so no per-entity class is needed here) becomes BAD_REQUEST. Anything else
 * propagates untouched.
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
      if (err instanceof MissingRequiredFieldError) {
        throw errors.BAD_REQUEST({ message: err.message });
      }
      throw err;
    }
  }
}
