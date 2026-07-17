import { oc } from '@orpc/contract';
import { z } from 'zod';

/**
 * Builds the standard upsert contract procedure: an input schema, the shared
 * CONFLICT error (thrown when two external IDs resolve to two different rows),
 * and an output that is the entity schema extended with a `created` flag.
 */
export function upsertProcedure<
  TInput extends z.ZodType,
  TEntity extends z.ZodObject,
>(inputSchema: TInput, entitySchema: TEntity) {
  return oc
    .input(inputSchema)
    .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
    .output(entitySchema.extend({ created: z.boolean() }));
}

/**
 * Upsert contract procedure WITHOUT the CONFLICT error. Used only by
 * externalSystems.upsert, which matches by name alone and so has no external
 * IDs to conflict between. The distinct name keeps this omission deliberate
 * and visible rather than an easy-to-miss flag.
 */
export function upsertProcedureWithoutConflict<
  TInput extends z.ZodType,
  TEntity extends z.ZodObject,
>(inputSchema: TInput, entitySchema: TEntity) {
  return oc
    .input(inputSchema)
    .output(entitySchema.extend({ created: z.boolean() }));
}
