import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import JSON5 from 'json5';

/** DI token carrying the absolute path to the JSON5 config file. */
export const IMPORT_BBL_CONFIG_PATH = Symbol('IMPORT_BBL_CONFIG_PATH');

/**
 * Default config-file location: `import-bbl-config.json5` in the current
 * working directory. The tool is run from `tools/import-bbl/`, so this resolves
 * to that directory's file — mirroring how the old `.env` was picked up.
 */
export const DEFAULT_IMPORT_BBL_CONFIG_PATH = resolve(
  process.cwd(),
  'import-bbl-config.json5',
);

@Injectable()
export class ImportBblConfigService {
  private readonly config: Record<string, unknown>;

  constructor(
    @Inject(IMPORT_BBL_CONFIG_PATH) private readonly filePath: string,
  ) {
    this.config = this.load();
  }

  /** Raw parsed value for a top-level key, or undefined when absent. */
  get<T>(key: string): T | undefined {
    return this.config[key] as T | undefined;
  }

  /**
   * Base URL of the running api-server to import into, from
   * `connection.apiBaseUrl`. Defaults to http://localhost:3000 when
   * `apiBaseUrl` itself is unset, but the `connection` group must be
   * present — kept mandatory so future mandatory fields under it (e.g. for
   * issue #133) don't need a breaking change to introduce.
   */
  getApiBaseUrl(): string {
    const connection = this.get<Record<string, unknown>>('connection');
    if (typeof connection !== 'object' || connection === null) {
      throw new Error(
        'connection is not set in import-bbl-config.json5. Set it to an ' +
          "object, e.g. { apiBaseUrl: 'http://localhost:3000' } (apiBaseUrl " +
          'itself defaults to http://localhost:3000 if omitted).',
      );
    }
    const url = connection.apiBaseUrl;
    return typeof url === 'string' && url !== ''
      ? url
      : 'http://localhost:3000';
  }

  /**
   * Read and parse the JSON5 file once. A missing file is treated as an empty
   * config so each getter can still throw its own friendly per-field error
   * lazily; a syntactically invalid file throws immediately with the path.
   */
  private load(): Record<string, unknown> {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON5.parse(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  }
}
