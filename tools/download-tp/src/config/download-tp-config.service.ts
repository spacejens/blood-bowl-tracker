import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import {
  browserGroupSchema,
  configGroupSchema,
  connectionGroupSchema,
  downloadGroupSchema,
  tournamentsSchema,
} from './download-tp-config.schema';

/** DI token carrying the absolute path to the JSON5 config file. */
export const DOWNLOAD_TP_CONFIG_PATH = Symbol('DOWNLOAD_TP_CONFIG_PATH');

/**
 * Default config-file location: `download-tp-config.json5` in the current
 * working directory. The tool is run from `tools/download-tp/`, so this
 * resolves to that directory's file.
 */
export const DEFAULT_DOWNLOAD_TP_CONFIG_PATH = resolve(
  process.cwd(),
  'download-tp-config.json5',
);

const CONNECTION_MISSING =
  'connection is not set in download-tp-config.json5. Set it to an object, ' +
  "e.g. { frontendUrl: 'https://tourplay.net/en/blood-bowl/', " +
  "backendApiUrl: 'https://tourplay.net/api/' }.";

@Injectable()
export class DownloadTpConfigService {
  private readonly config: Record<string, unknown>;

  constructor(
    @Inject(DOWNLOAD_TP_CONFIG_PATH) private readonly filePath: string,
  ) {
    this.config = this.load();
  }

  /** Raw parsed value for a top-level key, or undefined when absent. */
  get<T>(key: string): T | undefined {
    return this.config[key] as T | undefined;
  }

  /**
   * Base URL of the TP frontend, including a trailing slash, from
   * `connection.frontendUrl`. Required.
   */
  getFrontendUrl(): string {
    return this.getConnectionUrl(
      'frontendUrl',
      "'https://tourplay.net/en/blood-bowl/'",
    );
  }

  /**
   * Base URL of the TP API, including a trailing slash, from
   * `connection.backendApiUrl`. Required — responses whose URL starts with it
   * are the ones recorded.
   */
  getBackendApiUrl(): string {
    return this.getConnectionUrl(
      'backendApiUrl',
      "'https://tourplay.net/api/'",
    );
  }

  /**
   * Whether to run the browser headless, from `browser.headless`. Optional:
   * anything other than an explicit `true` means "show the browser".
   */
  isHeadless(): boolean {
    const browser = browserGroupSchema.safeParse(this.get('browser'));
    return browser.success && browser.data.headless === true;
  }

  /**
   * Tournament names to download, as they appear in the frontend path, from
   * `download.tournaments`. Required and non-empty.
   */
  getTournaments(): string[] {
    const download = downloadGroupSchema.safeParse(this.get('download'));
    if (!download.success) {
      throw new Error(
        'download is not set in download-tp-config.json5. Set it to an ' +
          "object, e.g. { tournaments: ['tloegbbl-sasong-30'] }.",
      );
    }
    const tournaments = tournamentsSchema.safeParse(download.data.tournaments);
    if (!tournaments.success) {
      throw new Error(
        'download.tournaments is not set in download-tp-config.json5. Set ' +
          'it to a non-empty array of tournament names, e.g. ' +
          "['tloegbbl-sasong-30'].",
      );
    }
    return tournaments.data;
  }

  /** Shared read of a required non-empty string URL under `connection`. */
  private getConnectionUrl(
    field: 'frontendUrl' | 'backendApiUrl',
    example: string,
  ): string {
    const connection = connectionGroupSchema.safeParse(this.get('connection'));
    if (!connection.success) {
      throw new Error(CONNECTION_MISSING);
    }
    const url = connection.data[field];
    if (url === undefined) {
      throw new Error(
        `connection.${field} is not set in download-tp-config.json5. Set it ` +
          `to a non-empty string, e.g. ${example}.`,
      );
    }
    return url;
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

    return configGroupSchema.parse(parsed);
  }
}
