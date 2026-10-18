import { z } from 'zod';

/**
 * Whether an upsert that matches an existing row may overwrite that row's
 * `name`. Omitted or false: `name` is used only when the upsert creates the
 * row. Only `tools/import-manual`, where names are curated, sends `true`; the
 * source importers never do, so re-running them cannot undo a curated name.
 */
export const RenameExistingSchema = z.boolean().optional();
