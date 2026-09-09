import { z } from 'zod';

/**
 * The config file as a whole: a JSON5 object, with anything else (including
 * a missing file) becoming an empty config so each getter still throws its
 * own friendly per-field error rather than a schema error.
 */
export const configFileSchema = z.looseObject({}).catch(() => ({}));

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

/**
 * `download.tournaments`: a list of non-empty names. May be empty — a config
 * that only downloads the official team list (see `rulesSetsSchema`) is a
 * supported setup, so main.ts skips the per-tournament scrape entirely.
 */
export const tournamentsSchema = z.array(z.string().min(1));

/**
 * `download.rulesSets`: a non-empty list of the rules sets to download TP's
 * official team list for. Each value names both the tab on TP's teams page
 * and the `data/teams/<rulesSet>/` output folder, and is matched
 * case-insensitively against an era's configured rules-set name on the
 * import side.
 */
export const rulesSetsSchema = z.array(z.string().min(1)).min(1);
