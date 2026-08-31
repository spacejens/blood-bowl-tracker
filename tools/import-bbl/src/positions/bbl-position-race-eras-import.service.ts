import type {
  PositionRaceEraCharacteristics,
  RulesSet,
} from '@blood-bowl-tracker/api-contract';
import type {
  ImportError,
  ImportResult,
  SyncPositionRaceErasData,
} from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  PositionRaceEraEligibilityService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { BblPositionCharacteristics } from './position-page-parser';

export interface SyncPositionRaceErasOptions {
  positionRaceCandidates: Map<
    number,
    { isStarPlayer: boolean; raceDbIds: Set<number> }
  >;
  racesByBblId: Map<string, { id: number; name: string }>;
  /** Every rules set the rules-sets step upserted, with its declared formats. */
  rulesSetsByName: Map<string, RulesSet>;
  eraIdsByRaceId: Map<number, Set<number>>;
  positionsUsedByEra: Set<string>;
  /** The raw characteristics line scraped from each position's page. */
  characteristicsByPositionId: Map<number, BblPositionCharacteristics>;
}

@Injectable()
export class BblPositionRaceErasImportService {
  constructor(
    private readonly positionsImport: PositionsImportService,
    private readonly eraConfig: EraConfigService,
    private readonly importResults: ImportResultService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly lookup: ReferenceLookupService,
    private readonly eligibility: PositionRaceEraEligibilityService,
  ) {}

  /**
   * Phase 2 of the positions_race_eras heuristic, deciding availability per
   * (position, race, era) after players are imported, and attaching that
   * position's scraped characteristics to every entry it can.
   *
   * The decision itself lives in PositionRaceEraEligibilityService so BBL,
   * TP and any later source share one rule: a config override wins outright,
   * else a star player counts, else a recorded use counts, else the position
   * was not available. Absence of data is never read as availability — a row
   * asserts the position really was playable, which is what makes its
   * characteristics meaningful.
   *
   * Characteristics are validated server-side against the era's rules set.
   * An era spanning a rules-set change resolves to its *last* declared rules
   * set: in every real era all of an era's rules sets share the same
   * characteristic formats, so which one is named only affects validation,
   * never the stored values.
   */
  async syncPositionRaceEras({
    positionRaceCandidates,
    racesByBblId,
    rulesSetsByName,
    eraIdsByRaceId,
    positionsUsedByEra,
    characteristicsByPositionId,
  }: SyncPositionRaceErasOptions): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const bblSystemName = this.externalSystemName.getBblSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap(
      [{ name: bblSystemName, category: 'imported_data_source' }],
      'Failed to upsert external system: ',
    );
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported, errors }) };
    }
    const [bblSystemId] = bootstrap.ids;

    const eras = this.eraConfig.getEras();

    // One round trip for the whole run: every era referenced here was
    // upserted moments ago by the eras step, so it is already in the
    // database and resolvable by the same external id (its name) that step
    // wrote. Resolved once into a name-keyed map so the override loop below
    // can keep looking eras up by name.
    const eraNames = [...new Set(eras.map((era) => era.identity.name))];
    const eraRefs = eraNames.map((name) => ({
      externalSystemId: bblSystemId,
      externalId: name,
    }));
    const resolvedEraIds = await this.lookup.lookupMap('era', eraRefs);
    const eraIdsByName = new Map<string, number>();
    for (const name of eraNames) {
      const id = resolvedEraIds.get(
        this.lookup.keyOf({ externalSystemId: bblSystemId, externalId: name }),
      );
      if (id !== undefined) {
        eraIdsByName.set(name, id);
      }
    }

    // Era db id -> the era's last declared rules set. An era spanning a
    // rules-set change (e.g. CRP, CRP+, BB2016) still yields one entry: the
    // rules set is named only so the server can validate the values against
    // its declared formats, and every rules set within one era shares those.
    const rulesSetByEraId = new Map<number, RulesSet>();
    const unresolvedRulesSetByEraId = new Map<number, string>();
    for (const era of eras) {
      const eraId = eraIdsByName.get(era.identity.name);
      if (eraId === undefined) {
        continue;
      }
      const name = era.identity.rulesSets.at(-1);
      if (name === undefined) {
        continue;
      }
      const rulesSet = rulesSetsByName.get(name);
      if (rulesSet === undefined) {
        unresolvedRulesSetByEraId.set(eraId, name);
        continue;
      }
      rulesSetByEraId.set(eraId, rulesSet);
    }

    // One round trip for the whole run: every position override here
    // references a position the positions step upserted moments ago, so it
    // is already in the database and resolvable by its composite
    // typId-raceBblId external id. Resolved once into a ref-keyed map so the
    // override loop below can keep looking positions up locally.
    const overridePositionRefs = [
      ...new Set(
        eras.flatMap(
          (era) =>
            era.positions?.map((o) => `${o.positionId}-${o.raceId}`) ?? [],
        ),
      ),
    ].map((externalId) => ({ externalSystemId: bblSystemId, externalId }));
    const positionIds = await this.lookup.lookupMap(
      'position',
      overridePositionRefs,
    );

    // Resolve config overrides to DB ids, grouped by positionId.
    // overridesByPositionId: positionId -> ("${raceId}:${eraId}" -> available)
    const overridesByPositionId = new Map<number, Map<string, boolean>>();
    for (const era of eras) {
      const eraId = eraIdsByName.get(era.identity.name);
      for (const o of era.positions ?? []) {
        const positionId = positionIds.get(
          this.lookup.keyOf({
            externalSystemId: bblSystemId,
            externalId: `${o.positionId}-${o.raceId}`,
          }),
        );
        const race = racesByBblId.get(o.raceId);
        if (
          positionId === undefined ||
          race === undefined ||
          eraId === undefined
        ) {
          errors.push(
            this.importResults.error({
              item: { ...o, era: era.identity.name },
              message: `Could not resolve positions override (typId ${o.positionId}, race ${o.raceId}, era "${era.identity.name}") to DB ids`,
            }),
          );
          continue;
        }
        let byRaceEra = overridesByPositionId.get(positionId);
        if (!byRaceEra) {
          byRaceEra = new Map();
          overridesByPositionId.set(positionId, byRaceEra);
        }
        byRaceEra.set(`${race.id}:${eraId}`, o.available);
      }
    }

    for (const [positionId, candidate] of positionRaceCandidates) {
      const overrides = overridesByPositionId.get(positionId);
      const scraped = characteristicsByPositionId.get(positionId);
      const raceEras: SyncPositionRaceErasData['raceEras'] = [];
      const missingRulesSetNames = new Set<string>();

      for (const raceId of candidate.raceDbIds) {
        for (const eraId of eraIdsByRaceId.get(raceId) ?? []) {
          const eligible = this.eligibility.isEligible({
            override: overrides?.get(`${raceId}:${eraId}`),
            isStarPlayer: candidate.isStarPlayer,
            hasPositiveEvidence: positionsUsedByEra.has(
              `${positionId}:${eraId}`,
            ),
          });
          if (!eligible) {
            continue;
          }
          const rulesSet = rulesSetByEraId.get(eraId);
          if (rulesSet === undefined) {
            const missing = unresolvedRulesSetByEraId.get(eraId);
            if (missing !== undefined) {
              missingRulesSetNames.add(missing);
            }
            // Availability is still real even when the rules set naming its
            // formats could not be resolved; only the characteristics are
            // lost.
            raceEras.push({ raceId, eraId });
            continue;
          }
          raceEras.push({
            raceId,
            eraId,
            // A position whose page failed to parse already recorded an
            // error in the positions step; there is nothing new to report
            // here, and its availability still stands.
            ...(scraped
              ? {
                  characteristics: this.buildCharacteristics(scraped, rulesSet),
                }
              : {}),
          });
        }
      }

      if (missingRulesSetNames.size > 0) {
        errors.push(
          this.importResults.error({
            item: { positionId, rulesSets: [...missingRulesSetNames] },
            message: `Could not resolve rules set(s) ${[...missingRulesSetNames]
              .map((name) => `"${name}"`)
              .join(
                ', ',
              )} for position ${positionId}: not upserted by the rules sets step`,
          }),
        );
      }

      const result = await this.positionsImport.syncRaceEras(
        { positionId, raceEras },
        errors,
      );
      if (result) {
        imported += 1;
      }
    }

    return { result: this.importResults.result({ imported, errors }) };
  }

  /**
   * The scraped line as the API wants it for one rules set. Passing has three
   * states: `null` where the rules set has no Passing characteristic at all,
   * `0` where the page showed "-" (the position cannot pass under a rules set
   * that does have Passing), and otherwise the scraped value.
   */
  private buildCharacteristics(
    scraped: BblPositionCharacteristics,
    rulesSet: RulesSet,
  ): PositionRaceEraCharacteristics {
    return {
      rulesSetId: rulesSet.id,
      move: scraped.move,
      strength: scraped.strength,
      agility: scraped.agility,
      passing:
        rulesSet.passingFormat === 'absent' ? null : (scraped.passing ?? 0),
      armour: scraped.armour,
    };
  }
}
