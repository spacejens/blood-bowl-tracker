import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/** The one member of an API-client resource this base class calls. */
export interface UpsertResource<TData, TResult> {
  upsert: (data: TData) => Promise<TResult>;
}

/** The two genuinely per-entity decisions an upsert import service makes. */
export interface UpsertImportServiceConfig<TData, TResult> {
  /** Which API-client resource to upsert through, e.g. `(client) => client.leagues`. */
  resource: (client: ApiClient) => UpsertResource<TData, TResult>;
  /** The per-item failure message; wording (and any name fallback) is entity-specific. */
  buildErrorMessage: (data: TData, error: unknown) => string;
}

/**
 * What every generated base class offers. `client` and `importRunner` are
 * exposed (rather than private) so a subclass that adds one entity-specific
 * method — `PositionsImportService.syncRaceEras`,
 * `CompetitionGroupsImportService.listCompetitionGroups` — can reach the same
 * injected collaborators without redeclaring the DI constructor.
 */
export interface UpsertImportService<TData, TResult> {
  readonly client: ApiClient;
  readonly importRunner: ImportRunnerService;
  upsert(data: TData, errors: ImportError[]): Promise<TResult | undefined>;
}

/**
 * Named so `tsc --declaration` can emit `declare const X_base: ...` for every
 * subclass; an anonymous class expression here would fail declaration emit.
 */
export type UpsertImportServiceConstructor<TData, TResult> = new (
  client: ApiClient,
  importRunner: ImportRunnerService,
) => UpsertImportService<TData, TResult>;

/**
 * Builds the shared body of an entity's import service: run the client's
 * upsert through `ImportRunnerService.recordUpsertResult`, so a failure
 * becomes one `ImportError` in the caller's list and `undefined`, and one bad
 * row never aborts a batch.
 *
 * A loose function rather than a service by the "generic over entity type"
 * exemption in CLAUDE.md's "Service vs. loose function" — it is parameterized
 * by compile-time generics and returns the class NestJS DI then manages. The
 * `@Injectable()` decorator and the `@Inject(API_CLIENT)` parameter decorator
 * live on the base, and NestJS finds their metadata through the subclass's
 * prototype chain, which is why a subclass needs no constructor of its own.
 */
export function createUpsertImportServiceBase<TData, TResult>(
  config: UpsertImportServiceConfig<TData, TResult>,
): UpsertImportServiceConstructor<TData, TResult> {
  @Injectable()
  class UpsertImportServiceBase implements UpsertImportService<TData, TResult> {
    constructor(
      @Inject(API_CLIENT) readonly client: ApiClient,
      readonly importRunner: ImportRunnerService,
    ) {}

    upsert(data: TData, errors: ImportError[]): Promise<TResult | undefined> {
      return this.importRunner.recordUpsertResult({
        upsert: () => config.resource(this.client).upsert(data),
        item: data,
        errors,
        buildErrorMessage: (err) => config.buildErrorMessage(data, err),
      });
    }
  }

  return UpsertImportServiceBase;
}
