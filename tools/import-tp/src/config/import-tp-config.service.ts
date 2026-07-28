import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import JSON5 from 'json5';

/** DI token carrying the absolute path to the JSON5 config file. */
export const IMPORT_TP_CONFIG_PATH = Symbol('IMPORT_TP_CONFIG_PATH');

/**
 * Default config-file location: `import-tp-config.json5` in the current
 * working directory. The tool is run from `tools/import-tp/`, so this resolves
 * to that directory's file.
 */
export const DEFAULT_IMPORT_TP_CONFIG_PATH = resolve(
  process.cwd(),
  'import-tp-config.json5',
);

@Injectable()
export class ImportTpConfigService {
  private readonly config: Record<string, unknown>;

  constructor(
    @Inject(IMPORT_TP_CONFIG_PATH) private readonly filePath: string,
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
   * `apiBaseUrl` itself is unset, but the `connection` group must be present.
   */
  getApiBaseUrl(): string {
    const url = this.getConnection().apiBaseUrl;
    return typeof url === 'string' && url !== ''
      ? url
      : 'http://localhost:3000';
  }

  /**
   * Bearer token this tool authenticates to the api-server with, from
   * `connection.apiToken`. Required — the api-server rejects unauthenticated
   * requests with 401, so there is no useful default.
   */
  getApiToken(): string {
    const connection = this.getConnection();
    const token = connection.apiToken;
    if (typeof token !== 'string' || token === '') {
      throw new Error(
        'connection.apiToken is not set in import-tp-config.json5. Set it ' +
          'to the bearer token this tool authenticates with; it must match ' +
          'the API_TOKEN_IMPORT_TP value in apps/discord-bot/.env.',
      );
    }
    return token;
  }

  /** The required `connection` group, or a friendly error when it's absent. */
  private getConnection(): Record<string, unknown> {
    const connection = this.get<Record<string, unknown>>('connection');
    if (typeof connection !== 'object' || connection === null) {
      throw new Error(
        'connection is not set in import-tp-config.json5. Set it to an ' +
          "object, e.g. { apiBaseUrl: 'http://localhost:3000', apiToken: " +
          "'your-token' } (apiBaseUrl itself defaults to " +
          'http://localhost:3000 if omitted).',
      );
    }
    return connection;
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
