import {
  createImportConfigPaths,
  createImportConfigServiceBase,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/** DI token carrying the absolute path to the JSON5 config file. */
export const IMPORT_TP_CONFIG_PATH = Symbol('IMPORT_TP_CONFIG_PATH');

const paths = createImportConfigPaths('import-tp-config');

/**
 * Default config-file location: `import-tp-config.json5` in the current
 * working directory. The tool is run from `tools/import-tp/`, so this resolves
 * to that directory's file.
 */
export const DEFAULT_IMPORT_TP_CONFIG_PATH = paths.defaultPath;

/**
 * Config-file location used when `IMPORT_CONFIG_ENV=production`:
 * `import-tp-config.production.json5` in the current working directory,
 * a sibling of the default file. Git-ignored like the default one, and holds
 * the production api-server's bearer token (see
 * docs/discord-bot/production-imports.md).
 */
export const PRODUCTION_IMPORT_TP_CONFIG_PATH = paths.productionPath;

/**
 * Pick the config file for this run — see `createImportConfigPaths` in
 * `@blood-bowl-tracker/import` for the resolution rules.
 */
export const resolveImportTpConfigPath = paths.resolvePath;

@Injectable()
export class ImportTpConfigService extends createImportConfigServiceBase({
  pathToken: IMPORT_TP_CONFIG_PATH,
  fileBaseName: 'import-tp-config',
  apiTokenEnvVar: 'API_TOKEN_IMPORT_TP',
}) {}
