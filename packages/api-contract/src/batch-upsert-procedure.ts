import { oc } from '@orpc/contract';
import { z } from 'zod';

/**
 * Builds the batch counterpart of {@link upsertProcedure}: an array of the
 * same upsert inputs (at least one), answered by an index-aligned array of
 * per-item results.
 *
 * Unlike the single-item procedure this declares NO contract errors. A
 * per-item domain failure (conflicting external IDs, a create-path payload
 * missing a required column, a match category that does not fit its
 * competition) is carried in that item's `{success: false, error}` entry
 * instead of being thrown for the whole call, so one bad item never costs
 * its siblings their upserts. That also means there is no
 * `batchUpsertProcedureWithoutConflict` counterpart: with no CONFLICT error
 * to omit, `externalSystems.upsertBatch` uses this very builder.
 *
 * An unexpected (non-domain) server-side error is NOT per-item: it still
 * propagates as a thrown RPC error and fails the whole batch — see
 * `UpsertHandlerService.runBatch`.
 */
export function batchUpsertProcedure<
  TInput extends z.ZodType,
  TShape extends z.ZodRawShape,
>(inputSchema: TInput, entitySchema: z.ZodObject<TShape>) {
  return oc.input(z.array(inputSchema).min(1)).output(
    z.array(
      z.discriminatedUnion('success', [
        entitySchema.extend({
          success: z.literal(true),
          created: z.boolean(),
        }),
        z.object({ success: z.literal(false), error: z.string() }),
      ]),
    ),
  );
}
