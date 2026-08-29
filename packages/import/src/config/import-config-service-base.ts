import type { ConfigLoader } from '@blood-bowl-tracker/config-loader';
import { createConfigLoaderServiceBase } from '@blood-bowl-tracker/config-loader';
import type { InjectionToken } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import type { ConnectionConfig } from './shared-config.schema';
import {
  configGroupSchema,
  connectionConfigSchema,
} from './shared-config.schema';

/** The three genuinely per-tool decisions an import config service makes. */
export interface ImportConfigServiceConfig {
  /** DI token carrying the absolute path to the tool's JSON5 config file. */
  pathToken: InjectionToken;
  /** The config file's name without its extension, e.g. `import-bbl-config`. */
  fileBaseName: string;
  /**
   * The api-server env var this tool's token must match, e.g.
   * `API_TOKEN_IMPORT_BBL`, named in the missing-token error message.
   */
  apiTokenEnvVar: string;
}

/** What every generated import config base class offers. */
export interface ImportConfigService extends ConfigLoader {
  getApiBaseUrl(): string;
  getApiToken(): string;
}

/**
 * Named so `tsc --declaration` can emit `declare const X_base: ...` for every
 * subclass; an anonymous class expression here would fail declaration emit.
 */
export type ImportConfigServiceConstructor = new (
  filePath: string,
) => ImportConfigService;

/**
 * Builds the shared body of an import tool's config service: the generic JSON5
 * loading from `packages/config-loader`, plus the connection getters all three
 * import tools share, with the tool's own config file name and api-token env
 * var substituted into the error messages.
 *
 * A loose function rather than a service by the "generic over entity type"
 * exemption in CLAUDE.md's "Service vs. loose function" — it is parameterized
 * by a config object and returns the class NestJS DI then manages. The
 * `@Injectable()` decorator and the base's `@Inject(pathToken)` parameter
 * decorator are found through the subclass's prototype chain, which is why a
 * subclass needs no constructor of its own.
 */
export function createImportConfigServiceBase(
  config: ImportConfigServiceConfig,
): ImportConfigServiceConstructor {
  const fileName = `${config.fileBaseName}.json5`;

  @Injectable()
  class ImportConfigServiceBase
    extends createConfigLoaderServiceBase({
      pathToken: config.pathToken,
      schema: configGroupSchema,
    })
    implements ImportConfigService
  {
    /**
     * Base URL of the running api-server to import into, from
     * `connection.apiBaseUrl`. Defaults to http://localhost:3000 when
     * `apiBaseUrl` itself is unset, but the `connection` group must be present.
     */
    getApiBaseUrl(): string {
      return this.getConnection().apiBaseUrl ?? 'http://localhost:3000';
    }

    /**
     * Bearer token this tool authenticates to the api-server with, from
     * `connection.apiToken`. Required — the api-server rejects unauthenticated
     * requests with 401, so there is no useful default.
     */
    getApiToken(): string {
      const token = this.getConnection().apiToken;
      if (token === undefined) {
        throw new Error(
          `connection.apiToken is not set in ${fileName}. Set it to the ` +
            'bearer token this tool authenticates with; it must match the ' +
            `${config.apiTokenEnvVar} value in apps/discord-bot/.env.`,
        );
      }
      return token;
    }

    /** The required `connection` group, or a friendly error when it's absent. */
    private getConnection(): ConnectionConfig {
      const parsed = connectionConfigSchema.safeParse(this.get('connection'));
      if (!parsed.success) {
        throw new Error(
          `connection is not set in ${fileName}. Set it to an object, e.g. ` +
            "{ apiBaseUrl: 'http://localhost:3000', apiToken: 'your-token' } " +
            '(apiBaseUrl itself defaults to http://localhost:3000 if omitted).',
        );
      }
      return parsed.data;
    }
  }

  return ImportConfigServiceBase;
}
