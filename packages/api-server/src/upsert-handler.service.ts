import { Injectable } from '@nestjs/common';

/**
 * The subset of an oRPC handler's `errors` object this helper needs: the
 * CONFLICT constructor. Typed structurally so the helper does not depend on
 * any one contract endpoint's generated error type.
 */
export interface ConflictErrors {
  CONFLICT: (payload: { message: string }) => Error;
}

/**
 * The shared body of every RPC upsert handler: run the service's upsert,
 * flatten the entity and its created flag into the response, and translate the
 * entity's own conflict error into the contract's CONFLICT error. Anything else
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
      throw err;
    }
  }
}
