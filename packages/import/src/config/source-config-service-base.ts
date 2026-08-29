import { resolve } from 'node:path';

import type { ConfigLoader } from '@blood-bowl-tracker/config-loader';
import type { Type } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';

import { nonEmptyStringSchema } from './shared-config.schema';

/** What every generated source-config base class offers. */
export interface SourceConfig {
  getDataDir(): string;
}

/** The three genuinely per-tool decisions a source config service makes. */
export interface SourceConfigServiceConfig {
  /** The tool's own config service, used as the DI token to inject it. */
  configService: Type<ConfigLoader>;
  /** Config file named in the error message, e.g. `import-bbl-config.json5`. */
  fileName: string;
  /**
   * What the folder holds, rendered after "Set it to the folder " and before a
   * final period — so it carries no trailing period of its own, e.g.
   * `containing one subdirectory per era (e.g. data/)`.
   */
  dataDirDescription: string;
}

/**
 * Named so `tsc --declaration` can emit `declare const X_base: ...` for every
 * subclass; an anonymous class expression here would fail declaration emit.
 */
export type SourceConfigServiceConstructor = new (
  config: ConfigLoader,
) => SourceConfig;

/**
 * Builds the shared body of an import tool's source config service: resolve
 * `dataDir` to an absolute path (a relative value against the current working
 * directory), or throw the tool's own friendly error naming its config file
 * and what the folder should hold.
 *
 * A loose function rather than a service by the "generic over entity type"
 * exemption in CLAUDE.md's "Service vs. loose function" — it is parameterized
 * by a config object and returns the class NestJS DI then manages. The
 * `@Injectable()` and `@Inject(configService)` metadata is found through the
 * subclass's prototype chain, so a subclass needs no constructor of its own.
 */
export function createSourceConfigServiceBase(
  config: SourceConfigServiceConfig,
): SourceConfigServiceConstructor {
  @Injectable()
  class SourceConfigServiceBase implements SourceConfig {
    constructor(
      @Inject(config.configService) private readonly source: ConfigLoader,
    ) {}

    getDataDir(): string {
      const parsed = nonEmptyStringSchema.safeParse(this.source.get('dataDir'));
      if (!parsed.success) {
        throw new Error(
          `dataDir is not set in ${config.fileName}. Set it to the folder ` +
            `${config.dataDirDescription}.`,
        );
      }
      return resolve(parsed.data);
    }
  }

  return SourceConfigServiceBase;
}
