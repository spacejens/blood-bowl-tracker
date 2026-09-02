import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { EraDataConfig } from './era-data-config.service';

@Injectable()
export class TpEraRulesSetResolverService {
  constructor(
    private readonly importResults: ImportResultService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Each era's single rules set, as a DB id. Characteristics are per rules
   * set, and TP's raw numeric `ruleSet` field has no established name mapping,
   * so the era config's declared `rulesSets` is the only reliable source. An
   * era declaring anything other than exactly one rules set is ambiguous:
   * every roster in it is skipped for characteristics (its other import steps
   * are unaffected) and one error is recorded naming it. An unresolvable rules
   * set name is recorded once per rules set, not once per era that uses it --
   * but "once" is per CALL: this service is injected separately by the
   * positions and players importers, each with its own `errors` array, so a
   * single misconfigured era is currently reported once by each of the two
   * importers in one import run (two errors overall, not one). Acceptable
   * today because the two messages point at the same root cause; consolidate
   * into a single shared resolution (computed once and threaded into both
   * importers, the way `characteristicsByPositionId` already is) if the
   * duplication ever becomes confusing in practice.
   *
   * Shared by the positions and players importers: both need the same
   * era -> rules set mapping to send characteristics for validation.
   */
  async resolveRulesSetIdByEraName(options: {
    eras: EraDataConfig[];
    tpSystemId: number;
    errors: ImportError[];
  }): Promise<Map<string, number>> {
    const { eras, tpSystemId, errors } = options;
    const singleRulesSetByEraName = new Map<string, string>();
    for (const era of eras) {
      if (era.rulesSets.length === 1) {
        singleRulesSetByEraName.set(era.name, era.rulesSets[0]);
        continue;
      }
      errors.push(
        this.importResults.error({
          item: { era: era.name, rulesSets: era.rulesSets },
          message:
            `Era "${era.name}" declares ${era.rulesSets.length} rules sets ` +
            `(${era.rulesSets.join(', ')}); characteristics need exactly ` +
            'one, so they are skipped for every roster in this era.',
        }),
      );
    }

    const rulesSetIds = await this.lookup.lookupMap(
      'rulesSet',
      [...new Set(singleRulesSetByEraName.values())].map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
    );

    const idByEraName = new Map<string, number>();
    const unresolved = new Set<string>();
    for (const [eraName, rulesSetName] of singleRulesSetByEraName) {
      const rulesSetId = rulesSetIds.get(
        this.lookup.keyOf({
          externalSystemId: tpSystemId,
          externalId: rulesSetName,
        }),
      );
      if (rulesSetId === undefined) {
        if (!unresolved.has(rulesSetName)) {
          unresolved.add(rulesSetName);
          errors.push(
            this.importResults.error({
              item: { era: eraName, rulesSet: rulesSetName },
              message:
                `Could not resolve rules set "${rulesSetName}" (era ` +
                `"${eraName}"); characteristics are skipped for it.`,
            }),
          );
        }
        continue;
      }
      idByEraName.set(eraName, rulesSetId);
    }
    return idByEraName;
  }
}
