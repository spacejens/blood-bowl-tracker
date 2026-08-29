import { resolve } from 'node:path';

import { createConfigLoaderServiceBase } from '@blood-bowl-tracker/config-loader';
import { Injectable } from '@nestjs/common';

import {
  browserGroupSchema,
  configFileSchema,
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
export class DownloadTpConfigService extends createConfigLoaderServiceBase({
  pathToken: DOWNLOAD_TP_CONFIG_PATH,
  schema: configFileSchema,
}) {
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
}
