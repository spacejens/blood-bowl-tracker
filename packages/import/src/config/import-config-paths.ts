import { resolve } from 'node:path';

/** The config-file paths one import tool runs against. */
export interface ImportConfigPaths {
  /** `<fileBaseName>.json5` in the current working directory. */
  defaultPath: string;
  /**
   * `<fileBaseName>.production.json5` in the current working directory, a
   * sibling of the default file. Git-ignored like the default one, and holds
   * the production api-server's bearer token (see
   * docs/discord-bot/production-hosting.md).
   */
  productionPath: string;
  /**
   * Pick the config file for this run: the `.production.json5` variant when
   * `IMPORT_CONFIG_ENV` is exactly `production`, the default file otherwise
   * (including when the variable is unset or holds any other value).
   */
  resolvePath: () => string;
}

/**
 * Builds one import tool's config-file path pair and its path picker. Each
 * tool is run from its own directory, so both paths resolve against the
 * current working directory.
 *
 * A loose function rather than a service because the `resolvePath` it returns
 * is a module `useFactory` that bootstraps the very provider DI would
 * otherwise inject — see CLAUDE.md, "Service vs. loose function", case 3.
 */
export function createImportConfigPaths(
  fileBaseName: string,
): ImportConfigPaths {
  const defaultPath = resolve(process.cwd(), `${fileBaseName}.json5`);
  const productionPath = resolve(
    process.cwd(),
    `${fileBaseName}.production.json5`,
  );
  return {
    defaultPath,
    productionPath,
    resolvePath: () =>
      process.env.IMPORT_CONFIG_ENV === 'production'
        ? productionPath
        : defaultPath,
  };
}
