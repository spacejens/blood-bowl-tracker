import {
  createImportConfigPaths,
  createImportConfigServiceBase,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/** DI token carrying the absolute path to the JSON5 config file. */
export const IMPORT_MANUAL_CONFIG_PATH = Symbol('IMPORT_MANUAL_CONFIG_PATH');

const paths = createImportConfigPaths('import-manual-config');

/**
 * Default config-file location: `import-manual-config.json5` in the current
 * working directory. The tool is run from `tools/import-manual/`, so this
 * resolves to that directory's file.
 */
export const DEFAULT_IMPORT_MANUAL_CONFIG_PATH = paths.defaultPath;

/**
 * Config-file location used when `IMPORT_CONFIG_ENV=production`:
 * `import-manual-config.production.json5` in the current working directory,
 * a sibling of the default file. Git-ignored like the default one, and holds
 * the production api-server's bearer token (see
 * docs/discord-bot/production-hosting.md).
 */
export const PRODUCTION_IMPORT_MANUAL_CONFIG_PATH = paths.productionPath;

/**
 * Pick the config file for this run: the `.production.json5` variant when
 * `IMPORT_CONFIG_ENV` is exactly `production`, the default file otherwise
 * (including when the variable is unset or holds any other value).
 *
 * A loose function rather than a service because it is a module `useFactory`
 * that bootstraps the very provider DI would otherwise inject — see
 * CLAUDE.md, "Service vs. loose function", case 3.
 */
export const resolveImportManualConfigPath = paths.resolvePath;

@Injectable()
export class ImportManualConfigService extends createImportConfigServiceBase({
  pathToken: IMPORT_MANUAL_CONFIG_PATH,
  fileBaseName: 'import-manual-config',
  apiTokenEnvVar: 'API_TOKEN_IMPORT_MANUAL',
}) {}
