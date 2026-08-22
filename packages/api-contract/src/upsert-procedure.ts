import { oc } from '@orpc/contract';
import { z } from 'zod';

/**
 * Builds the standard upsert contract procedure: an input schema, the shared
 * CONFLICT error (thrown when two external IDs resolve to two different rows)
 * and BAD_REQUEST error (thrown when a payload lands on the insert path
 * without every column the entity table requires), and an output that is the
 * entity schema extended with a `created` flag.
 */
export function upsertProcedure<
  TInput extends z.ZodType,
  TShape extends z.ZodRawShape,
>(inputSchema: TInput, entitySchema: z.ZodObject<TShape>) {
  return oc
    .input(inputSchema)
    .errors({
      CONFLICT: { message: 'Conflicting external IDs' },
      BAD_REQUEST: { message: 'Missing required field(s) for a new entity' },
    })
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
  TShape extends z.ZodRawShape,
>(inputSchema: TInput, entitySchema: z.ZodObject<TShape>) {
  return oc
    .input(inputSchema)
    .output(entitySchema.extend({ created: z.boolean() }));
}

/**
 * Upsert contract procedure with BAD_REQUEST but WITHOUT the CONFLICT error.
 * Used only by trophyAwards.upsert: its natural key is enforced by a database
 * unique constraint (see packages/db/src/schema/trophy-awards.ts), so more
 * than one existing row can never match and there is nothing to conflict
 * between — but the upsert can still reject a payload whose player id does
 * not fit the trophy's recipient kind, which is a BAD_REQUEST. Distinct from
 * `upsertProcedureWithoutConflict` (which declares no errors at all) so
 * neither omission is an easy-to-miss flag.
 */
export function upsertProcedureBadRequestOnly<
  TInput extends z.ZodType,
  TShape extends z.ZodRawShape,
>(inputSchema: TInput, entitySchema: z.ZodObject<TShape>) {
  return oc
    .input(inputSchema)
    .errors({
      BAD_REQUEST: { message: 'Invalid payload for this entity' },
    })
    .output(entitySchema.extend({ created: z.boolean() }));
}
