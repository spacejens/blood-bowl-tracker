import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import { GitRootsService } from '../shared/git-roots.service';
import { GITIGNORED_PRODUCTION_IMPORT_CONFIG_FILES } from '../shared/gitignored-files';

export interface StaleProductionConfig {
  /** Repo-relative path. */
  readonly path: string;
  /** The config's actual `connection.apiBaseUrl`, or `undefined` if unset. */
  readonly actualApiBaseUrl: string | undefined;
  /**
   * Set instead of `actualApiBaseUrl` being meaningful when the file could
   * not be parsed as JSON5 at all — a malformed file is reported as stale
   * (it certainly isn't confirmed correct) rather than aborting the check
   * for every other config.
   */
  readonly parseError?: string;
}

export interface CheckProductionConfigPortResult {
  /**
   * Existing production configs whose `connection.apiBaseUrl` does not
   * exactly match `expectedApiBaseUrl`. A config file that does not exist
   * is not a finding — there is nothing to migrate.
   */
  readonly stale: readonly StaleProductionConfig[];
}

/**
 * Checks each `import-*-config.production.json5` present against the
 * tunnel's current local port, so `deploy-production` can catch a stale
 * `apiBaseUrl` left over from before the port moved, instead of silently
 * writing production-import data to whatever `apiBaseUrl` names.
 */
@Injectable()
export class CheckProductionConfigPortService {
  constructor(private readonly gitRoots: GitRootsService) {}

  async run(
    expectedApiBaseUrl: string,
  ): Promise<CheckProductionConfigPortResult> {
    const stale: StaleProductionConfig[] = [];
    const roots = await this.gitRoots.resolve();

    for (const path of GITIGNORED_PRODUCTION_IMPORT_CONFIG_FILES) {
      const fullPath = join(roots.worktreeRoot, path);
      if (!existsSync(fullPath)) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON5.parse(readFileSync(fullPath, 'utf8'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stale.push({ path, actualApiBaseUrl: undefined, parseError: message });
        continue;
      }
      const actualApiBaseUrl = this.readApiBaseUrl(parsed);
      if (actualApiBaseUrl !== expectedApiBaseUrl) {
        stale.push({ path, actualApiBaseUrl });
      }
    }

    return { stale };
  }

  private readApiBaseUrl(parsed: unknown): string | undefined {
    if (parsed === null || typeof parsed !== 'object') {
      return undefined;
    }
    const connection = (parsed as Record<string, unknown>).connection;
    if (connection === null || typeof connection !== 'object') {
      return undefined;
    }
    const apiBaseUrl = (connection as Record<string, unknown>).apiBaseUrl;
    return typeof apiBaseUrl === 'string' ? apiBaseUrl : undefined;
  }
}
