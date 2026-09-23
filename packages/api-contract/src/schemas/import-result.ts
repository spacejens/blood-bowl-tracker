import { z } from 'zod';

/**
 * One import problem: what it concerns (`item`, free-form) and a readable
 * message. The same shape every import tool reports in, so a result an
 * importer receives over RPC merges straight into its own run's results.
 */
export const ImportErrorSchema = z.object({
  item: z.unknown(),
  message: z.string(),
});

/** One import step's outcome; `success` is true exactly when `errors` is empty. */
export const ImportResultSchema = z.object({
  success: z.boolean(),
  imported: z.number().int(),
  errors: z.array(ImportErrorSchema),
});

export type ImportError = z.infer<typeof ImportErrorSchema>;
export type ImportResult = z.infer<typeof ImportResultSchema>;
