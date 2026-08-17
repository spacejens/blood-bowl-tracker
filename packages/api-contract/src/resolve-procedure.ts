import { oc } from '@orpc/contract';
import { z } from 'zod';

import { ExternalIdSchema } from './schemas/external-id';

/**
 * The answer to "which entity does this external-id pair name?".
 *
 * A miss is an ordinary, expected outcome — an authoring typo in a manual
 * data file, or a reference to an entity no import step has created yet — so
 * it is a typed result rather than a thrown error. That is why neither
 * resolve procedure declares any contract error at all.
 */
export const ResolveResultSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(true), id: z.number().int() }),
  z.object({ found: z.literal(false) }),
]);

export type ResolveResult = z.infer<typeof ResolveResultSchema>;

/** Resolve one external-id pair to the entity that already declares it. */
export function resolveProcedure() {
  return oc.input(ExternalIdSchema).output(ResolveResultSchema);
}

/**
 * The batch counterpart of {@link resolveProcedure}: a non-empty array of
 * pairs answered by an index-aligned array of results. Batching exists for
 * the same reason `batchUpsertProcedure` does — the import tools otherwise
 * make one network round trip per reference.
 */
export function resolveBatchProcedure() {
  return oc
    .input(z.array(ExternalIdSchema).min(1))
    .output(z.array(ResolveResultSchema));
}
