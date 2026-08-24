import { z } from 'zod';

/**
 * Just enough of an `import-*-config.production.json5` to read
 * `connection.apiBaseUrl`. Deliberately total: anything unreadable — a
 * non-object file, a non-object connection group, a non-string url —
 * becomes `undefined`, which the caller already reports as stale rather
 * than as a hard failure.
 */
export const productionConfigSchema = z
  .looseObject({
    connection: z
      .looseObject({ apiBaseUrl: z.string().optional().catch(undefined) })
      .catch({ apiBaseUrl: undefined })
      .optional(),
  })
  .catch({ connection: undefined });
