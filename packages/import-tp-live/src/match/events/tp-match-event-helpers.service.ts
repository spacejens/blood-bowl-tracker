import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { TeamEra } from './tp-match-events-builder.types';

export interface ResolveTeamEraOptions {
  teamErasByRosterId: Map<number, TeamEra[]>;
  rosterId: number;
  eraId: number;
}

/**
 * Small, pure, dependency-free helpers shared by
 * `TpMatchEventKindBuildersService` and `TpAdminMatchEventBuilderService` —
 * id resolution and `UpsertMatchEvent` field assembly with no branching on
 * external state. Hosted as a service, not a loose-function module, per this
 * repo's "Service vs. loose function" convention: pure data-transformation
 * functions with no dependencies of their own still become services here for
 * consistency, and neither injecting service performs I/O of its own, so
 * passing this one real (rather than mocking it) in their specs carries no
 * coupling risk.
 */
@Injectable()
export class TpMatchEventHelpersService {
  /** Resolve a roster id + era id to its team_eras id, or undefined. */
  resolveTeamEraId(options: ResolveTeamEraOptions): number | undefined {
    return options.teamErasByRosterId
      .get(options.rosterId)
      ?.find((teamEra) => teamEra.eraId === options.eraId)?.id;
  }

  externalIdEntry(
    tpSystemId: number,
    tpEventId: number,
    suffix?: 'home' | 'away',
  ): UpsertMatchEvent['externalIds'][number] {
    const id = suffix ? `tp-${tpEventId}-${suffix}` : `tp-${tpEventId}`;
    return { externalSystemId: tpSystemId, externalId: id };
  }

  externalId(
    tpSystemId: number,
    tpEventId: number,
    suffix?: 'home' | 'away',
  ): UpsertMatchEvent['externalIds'] {
    return [this.externalIdEntry(tpSystemId, tpEventId, suffix)];
  }

  /**
   * Set `data[key]` to `value` when it's resolved, leaving it `undefined`
   * (omitted, written as `null` by the server) otherwise. Centralizing this
   * "set only when resolved" check in one place — rather than repeating an
   * `if` at every call site across the touchdown, injury, and administrative
   * event builders — keeps branch coverage meaningful: one test exercising an
   * unresolved id and one exercising a resolved id together cover every call
   * site, instead of needing a pair of tests per site.
   */
  setIfDefined<K extends keyof UpsertMatchEvent>(
    data: UpsertMatchEvent,
    key: K,
    value: UpsertMatchEvent[K] | undefined,
  ): void {
    if (value !== undefined) {
      data[key] = value;
    }
  }
}
