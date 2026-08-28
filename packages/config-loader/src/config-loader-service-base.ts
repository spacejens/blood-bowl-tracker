import { readFileSync } from 'node:fs';

import type { InjectionToken } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import JSON5 from 'json5';
import type { ZodType } from 'zod';

/** What every generated config-loader base class offers its subclasses. */
export interface ConfigLoader {
  /** Raw parsed value for a top-level key, or undefined when absent. */
  get<T>(key: string): T | undefined;
}

/** The two genuinely per-tool decisions a config loader makes. */
export interface ConfigLoaderConfig {
  /** DI token carrying the absolute path to the tool's JSON5 config file. */
  pathToken: InjectionToken;
  /** Schema the parsed top-level value is validated against. */
  schema: ZodType<Record<string, unknown>, unknown>;
}

/**
 * Named so `tsc --declaration` can emit `declare const X_base: ...` for every
 * subclass; an anonymous class expression here would fail declaration emit.
 */
export type ConfigLoaderConstructor = new (filePath: string) => ConfigLoader;

/**
 * Builds the shared body of a tool's JSON5 config service: read the file once
 * in the constructor, treat a missing file as an empty config so each getter
 * can still throw its own friendly per-field error lazily, wrap a syntax
 * failure in an error naming the path, and validate the result against the
 * caller's top-level schema.
 *
 * A loose function rather than a service by the "generic over entity type"
 * exemption in CLAUDE.md's "Service vs. loose function" — it is parameterized
 * by a config object and returns the class NestJS DI then manages. The
 * `@Injectable()` decorator and the `@Inject(pathToken)` parameter decorator
 * live on the base, and NestJS finds their metadata through the subclass's
 * prototype chain, which is why a subclass needs no constructor of its own.
 */
export function createConfigLoaderServiceBase(
  config: ConfigLoaderConfig,
): ConfigLoaderConstructor {
  @Injectable()
  class ConfigLoaderServiceBase implements ConfigLoader {
    private readonly values: Record<string, unknown>;

    constructor(@Inject(config.pathToken) private readonly filePath: string) {
      this.values = this.load();
    }

    get<T>(key: string): T | undefined {
      return this.values[key] as T | undefined;
    }

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

      const result = config.schema.safeParse(parsed);
      if (!result.success) {
        throw new Error(
          `Failed to validate ${this.filePath}: ${result.error.message}`,
          { cause: result.error },
        );
      }
      return result.data;
    }
  }

  return ConfigLoaderServiceBase;
}
