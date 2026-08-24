import { z } from 'zod';

/**
 * The `connection` group. Lenient on the fields themselves so the service
 * can keep throwing one message for a missing group and a different,
 * field-specific message for each missing url.
 */
export const connectionGroupSchema = z.looseObject({
  frontendUrl: z.string().min(1).optional().catch(undefined),
  backendApiUrl: z.string().min(1).optional().catch(undefined),
});

/**
 * The optional `browser` group. Only an explicit `true` means headless, so
 * anything else becomes `undefined`.
 */
export const browserGroupSchema = z.looseObject({
  headless: z.literal(true).optional().catch(undefined),
});

/** The `download` group's presence — its contents are checked separately. */
export const downloadGroupSchema = z.looseObject({});

/** `download.tournaments`: a non-empty list of non-empty names. */
export const tournamentsSchema = z.array(z.string().min(1)).min(1);
