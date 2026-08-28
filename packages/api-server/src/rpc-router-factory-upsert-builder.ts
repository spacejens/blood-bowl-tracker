import type {
  AnySchema,
  ContractProcedure,
  ErrorMap,
  InferSchemaInput,
  Meta,
} from '@orpc/contract';
import { implement } from '@orpc/server';

import type {
  ConflictErrors,
  UpsertHandlerService,
} from './upsert-handler.service';

/**
 * One entity's upsert route, as a one-key object to spread into its block in
 * RpcRouterFactoryService.build(). unwrap pulls the entity and its created
 * flag out of the service's own differently-named result shape without any
 * game-data return shape changing.
 *
 * A standalone function rather than a private method on
 * RpcRouterFactoryService: adding it there pushed that file over its
 * 500-line ESLint cap, so it moved out into its own file, the same fix
 * Task 8 already applied to the resolve route's module-level types (see
 * rpc-router-factory-types.ts). It stays generic over the procedure's
 * schema types and the service's input/result/entity types, all supplied
 * concretely at each call site, so this still fits the "generic over
 * entity/table type" exception to the service-only convention in
 * CLAUDE.md — `upsertHandler` is passed in explicitly rather than injected,
 * exactly like the DB handle/table generics that exception already covers.
 *
 * The two casts are unavoidable and safe: inside a generic body TypeScript
 * cannot resolve InferSchemaInput<TOutputSchema> or the handler's
 * error-constructor map, but every call site instantiates them concretely,
 * so the router type build() returns is exactly what a hand-written
 * implement(...).handler(...) would produce, and oRPC still validates the
 * handler's output against the contract's schema at runtime.
 */
export function buildUpsertRoute<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
  TMeta extends Meta,
  TInput,
  TResult,
  TEntity extends object,
>(
  upsertHandler: UpsertHandlerService,
  options: {
    procedure: ContractProcedure<TInputSchema, TOutputSchema, TErrorMap, TMeta>;
    service: { upsert(input: TInput): Promise<TResult> };
    conflictError: abstract new (...args: never[]) => Error;
    unwrap: (result: TResult) => { entity: TEntity; created: boolean };
  },
) {
  return {
    upsert: implement(options.procedure).handler(async ({ input, errors }) => {
      const result = await upsertHandler.run(
        errors as unknown as ConflictErrors,
        options.conflictError,
        async () =>
          options.unwrap(
            await options.service.upsert(input as unknown as TInput),
          ),
      );
      return result as unknown as InferSchemaInput<TOutputSchema>;
    }),
  };
}
