import { DbModule } from '@blood-bowl-tracker/db';
import type { DynamicModule, Type } from '@nestjs/common';

/** The one thing the app module needs from a tool's config service. */
export interface ReviewDatabaseUrlProvider {
  getDatabaseUrl(): string;
}

/** The modules and classes a review tool plugs into the shared wiring. */
export interface ReviewAppModuleOptions {
  /** The tool's own `AppModule` class, which the DynamicModule is keyed on. */
  module: Type;
  /** The tool's `@Global()` config module, providing `configService`. */
  configModule: Type | DynamicModule;
  /** The tool's config service class; supplies the database url. */
  configService: Type<ReviewDatabaseUrlProvider>;
  /** The tool's harness module, exporting its `ReviewService`. */
  harnessModule: Type | DynamicModule;
}

/**
 * The `ConfigModule → DbModule.forRootAsync(configService.getDatabaseUrl())
 * → HarnessModule` wiring both review tools' `AppModule.register()` repeat.
 *
 * A loose function rather than an `@Injectable()` service on purpose: it runs
 * at module-definition time and produces the DynamicModule NestJS then builds
 * the injector from, so it cannot itself be injected — the same exemption
 * `createDb` (`packages/db/src/db.ts`) relies on.
 */
export function createReviewAppModule(
  options: ReviewAppModuleOptions,
): DynamicModule {
  return {
    module: options.module,
    imports: [
      options.configModule,
      DbModule.forRootAsync({
        useFactory: (config: ReviewDatabaseUrlProvider) =>
          config.getDatabaseUrl(),
        inject: [options.configService],
      }),
      options.harnessModule,
    ],
  };
}
