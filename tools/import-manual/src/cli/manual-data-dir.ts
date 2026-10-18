import { join } from 'node:path';

/** DI token carrying the absolute path of the tool's `data/` directory. */
export const MANUAL_DATA_DIR = Symbol('MANUAL_DATA_DIR');

/**
 * `tools/import-manual/data`, resolved from this file's own location (two
 * levels up from both `src/cli/` and the compiled `dist/cli/`), so the batch
 * commands work from any working directory.
 */
export const DEFAULT_MANUAL_DATA_DIR = join(__dirname, '../../data');
