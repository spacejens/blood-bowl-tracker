import type { FactoryProvider, InjectionToken } from '@nestjs/common';

/**
 * Builds the multi-provider a review tool registers its reviewers or
 * stratifiers through: NestJS has no `@Multiple()` mechanism, so the array is
 * assembled by a factory that simply collects its own injected arguments.
 *
 * A loose function rather than an `@Injectable()` service on purpose: it runs
 * at module-definition time, inside `@Module({ providers: [...] })` metadata,
 * so it cannot itself be resolved by DI — the same exemption `createDb`
 * (`packages/db/src/db.ts`) relies on.
 */
export function createRegistryProvider(
  token: InjectionToken,
  services: readonly InjectionToken[],
): FactoryProvider<unknown[]> {
  return {
    provide: token,
    useFactory: (...instances: unknown[]) => instances,
    inject: [...services],
  };
}
