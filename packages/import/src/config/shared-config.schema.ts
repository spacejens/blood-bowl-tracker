import { z } from 'zod';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Module-local schema builder — it assembles a zod value the way an object
 * literal would, rather than performing application logic. Produces an ISO
 * `YYYY-MM-DD` string schema that also rejects days no calendar has (e.g.
 * 2021-02-30, which `Date` would otherwise roll over into March), carrying
 * `message` on every failure mode so callers can render one consistent text.
 */
const isoDate = (message: string) =>
  z
    .string({ error: message })
    .regex(ISO_DATE_PATTERN, message)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    }, message);

/** A required ISO date field. */
export const isoDateSchema = isoDate('must be an ISO date (YYYY-MM-DD).');

/** An ISO date field that may be omitted entirely. */
export const optionalIsoDateSchema = isoDate(
  'must be an ISO date (YYYY-MM-DD) when present.',
).optional();

/**
 * A required, non-empty string. Used for bare scalar settings such as
 * `dataDir`, where the calling service supplies its own error text.
 */
export const nonEmptyStringSchema = z.string().min(1);

/**
 * The `externalSystemName` setting: a string with at least one
 * non-whitespace character. An unusable value is not an error anywhere it is
 * read — the caller falls back to its own default.
 */
export const externalSystemNameSchema = z
  .string()
  .refine((value) => value.trim() !== '');

/**
 * The `connection` group shared by import-bbl, import-tp and import-manual.
 * Deliberately lenient: parsing fails only when `connection` is not an
 * object, so each config service keeps throwing its own distinct
 * "connection is not set" and "connection.apiToken is not set" messages.
 * A present-but-unusable field becomes `undefined`, matching the
 * `typeof value === 'string' && value !== ''` reads it replaces. Unknown keys
 * are preserved so a config may carry settings this schema does not name.
 */
export const connectionConfigSchema = z.looseObject({
  apiBaseUrl: z.string().min(1).optional().catch(undefined),
  apiToken: z.string().min(1).optional().catch(undefined),
});

export type ConnectionConfig = z.infer<typeof connectionConfigSchema>;
