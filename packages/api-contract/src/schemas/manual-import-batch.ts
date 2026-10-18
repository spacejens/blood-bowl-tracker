import { z } from 'zod';

/**
 * One batch of tools/import-manual's curated data recorded as applied to the
 * database. `name` is the batch's directory name (e.g.
 * "002-initial-cleanup"); `contentHash` is the SHA-256 hex digest the
 * importer computes over the batch's parsed content, so the importer can tell
 * when an applied batch was edited.
 */
export const ManualImportBatchSchema = z.object({
  name: z.string(),
  contentHash: z.string(),
  appliedAt: z.coerce.date(),
});

export const RecordManualImportBatchSchema = z.object({
  name: z.string().min(1),
  contentHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'must be a lowercase hex SHA-256 digest'),
});

export const RecordManualImportBatchResultSchema =
  ManualImportBatchSchema.extend({ created: z.boolean() });

export type ManualImportBatch = z.infer<typeof ManualImportBatchSchema>;
export type RecordManualImportBatch = z.infer<
  typeof RecordManualImportBatchSchema
>;
export type RecordManualImportBatchResult = z.infer<
  typeof RecordManualImportBatchResultSchema
>;
