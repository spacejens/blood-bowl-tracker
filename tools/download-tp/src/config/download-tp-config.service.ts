import { resolve } from 'node:path';

import { createConfigLoaderServiceBase } from '@blood-bowl-tracker/config-loader';
import { Injectable } from '@nestjs/common';

import {
  browserGroupSchema,
  configFileSchema,
  connectionGroupSchema,
  downloadGroupSchema,
  rulesSetsSchema,
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
   * `download.tournaments`. Required to be present, but may be empty — an
   * empty list means "skip the per-tournament scrape entirely" and is how a
   * developer downloads only the official team list.
   */
  getTournaments(): string[] {
    const download = this.downloadGroup();
    const tournaments = tournamentsSchema.safeParse(download.tournaments);
    if (!tournaments.success) {
      throw new Error(
        'download.tournaments is not set in download-tp-config.json5. Set ' +
          'it to an array of tournament names, e.g. ' +
          "['tloegbbl-sasong-30'], or [] to skip the per-tournament scrape.",
      );
    }
    return tournaments.data;
  }

  /**
   * Rules sets to download TP's official team list for, from
   * `download.rulesSets`. Required and non-empty. Each value names the tab on
   * TP's teams page and the `data/teams/<rulesSet>/` output folder.
   */
  getRulesSets(): string[] {
    const download = this.downloadGroup();
    const rulesSets = rulesSetsSchema.safeParse(download.rulesSets);
    if (!rulesSets.success) {
      throw new Error(
        'download.rulesSets is not set in download-tp-config.json5. Set it ' +
          "to a non-empty array of rules set names, e.g. ['BB2020', " +
          "'DB2021', 'BB2025'].",
      );
    }
    return rulesSets.data;
  }

  /** The `download` group, or a friendly error naming it when unset. */
  private downloadGroup(): Record<string, unknown> {
    const download = downloadGroupSchema.safeParse(this.get('download'));
    if (!download.success) {
      throw new Error(
        'download is not set in download-tp-config.json5. Set it to an ' +
          "object, e.g. { tournaments: ['tloegbbl-sasong-30'], rulesSets: " +
          "['BB2020'] }.",
      );
    }
    return download.data;
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
