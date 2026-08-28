import type { ConfigLoader } from '@blood-bowl-tracker/config-loader';
import type { Type } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';

import { externalSystemNameSchema } from './shared-config.schema';

/** What every generated external-system-name base class offers. */
export interface ExternalSystemNameConfig {
  getSystemName(): string;
}

/** The two genuinely per-tool decisions this config service makes. */
export interface ExternalSystemNameConfigServiceConfig {
  /** The tool's own config service, used as the DI token to inject it. */
  configService: Type<ConfigLoader>;
  /** Name used when `externalSystemName` is unset or unusable, e.g. `BBL`. */
  defaultSystemName: string;
}

/**
 * Named so `tsc --declaration` can emit `declare const X_base: ...` for every
 * subclass; an anonymous class expression here would fail declaration emit.
 */
export type ExternalSystemNameConfigServiceConstructor = new (
  config: ConfigLoader,
) => ExternalSystemNameConfig;

/**
 * Builds the shared body of an import tool's external-system-name config
 * service: read `externalSystemName`, and fall back to the tool's own default
 * whenever the value is unset or unusable. Unlike the other import config
 * getters, this one never throws.
 *
 * A loose function rather than a service by the "generic over entity type"
 * exemption in CLAUDE.md's "Service vs. loose function" — it is parameterized
 * by a config object and returns the class NestJS DI then manages. The
 * `@Injectable()` and `@Inject(configService)` metadata is found through the
 * subclass's prototype chain, so a subclass needs no constructor of its own.
 */
export function createExternalSystemNameConfigServiceBase(
  config: ExternalSystemNameConfigServiceConfig,
): ExternalSystemNameConfigServiceConstructor {
  @Injectable()
  class ExternalSystemNameConfigServiceBase implements ExternalSystemNameConfig {
    constructor(
      @Inject(config.configService) private readonly source: ConfigLoader,
    ) {}

    getSystemName(): string {
      const parsed = externalSystemNameSchema.safeParse(
        this.source.get('externalSystemName'),
      );
      return parsed.success ? parsed.data : config.defaultSystemName;
    }
  }

  return ExternalSystemNameConfigServiceBase;
}
