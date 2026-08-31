import type { RulesSet } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

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
  racesActiveByEra: Set<string>;
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
  ) {}

  /**
   * Phase 2 of the positions_race_eras heuristic, deciding availability per
   * (position, race, era) after players are imported.
   *
   * A config override for a (position, race, era) wins outright. Absent one,
   * two fallback branches are not self-evident: a star player counts as
   * available in every era regardless of use, and a race that fielded no
   * teams at all in an era counts as available too — its absence carries no
   * information either way, so treating it as unavailable would invent a
   * restriction.
   */
  async syncPositionRaceEras({
    positionRaceCandidates,
    racesByBblId,
    rulesSetsByName,
    eraIdsByRaceId,
    positionsUsedByEra,
    racesActiveByEra,
  }: SyncPositionRaceErasOptions): Promise<{
    result: ImportResult;
    rulesSetIdsByPositionId: Map<number, Set<number>>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    // Which rules sets each position gets a characteristics row for. This is
    // a stricter subset of the race-era availability decided below: it
    // requires positive evidence the position was actually played (a
    // config override, a star player, or an observed use), never the
    // race-era "no team fielded this race in this era" fallback, which would
    // otherwise fabricate a specific characteristics line for a (position,
    // rules set) pair with no evidence at all.
    const rulesSetIdsByPositionId = new Map<number, Set<number>>();

    const bblSystemName = this.externalSystemName.getBblSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap(
      [{ name: bblSystemName, category: 'imported_data_source' }],
      'Failed to upsert external system: ',
    );
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        rulesSetIdsByPositionId,
      };
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

    // Era db id -> the rules sets that era spans. An era covering a rules-set
    // change (e.g. CRP, CRP+, BB2016) yields one entry per rules set, each of
    // which gets the same scraped characteristics — BBL has no other source
    // for the older ones.
    const rulesSetIdsByEraId = new Map<number, Set<number>>();
    const unresolvedRulesSetsByEraId = new Map<number, Set<string>>();
    for (const era of eras) {
      const eraId = eraIdsByName.get(era.identity.name);
      if (eraId === undefined) {
        continue;
      }
      let ids = rulesSetIdsByEraId.get(eraId);
      if (!ids) {
        ids = new Set<number>();
        rulesSetIdsByEraId.set(eraId, ids);
      }
      for (const name of era.identity.rulesSets) {
        const rulesSet = rulesSetsByName.get(name);
        if (rulesSet === undefined) {
          let missing = unresolvedRulesSetsByEraId.get(eraId);
          if (!missing) {
            missing = new Set<string>();
            unresolvedRulesSetsByEraId.set(eraId, missing);
          }
          missing.add(name);
          continue;
        }
        ids.add(rulesSet.id);
      }
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
      const raceEras: { raceId: number; eraId: number }[] = [];
      const characteristicsEraIds = new Set<number>();
      for (const raceId of candidate.raceDbIds) {
        for (const eraId of eraIdsByRaceId.get(raceId) ?? []) {
          const key = `${raceId}:${eraId}`;
          const override = overrides?.get(key);
          let include: boolean;
          let includeForCharacteristics: boolean;
          if (override !== undefined) {
            include = override;
            includeForCharacteristics = override;
          } else if (candidate.isStarPlayer) {
            include = true;
            includeForCharacteristics = true;
          } else if (positionsUsedByEra.has(`${positionId}:${eraId}`)) {
            include = true;
            includeForCharacteristics = true;
          } else {
            // Characteristics require positive evidence the position was
            // actually played under a rules set. "No team fielded this race
            // in this era, so treat it as available" is a reasonable default
            // for general race-era availability (see the class doc
            // comment), but it would fabricate a specific characteristics
            // line for a (position, rules set) pair with no evidence at all
            // — worse than carrying none. Issue #670 fills these back in by
            // hand, including under BB2020 itself, once real evidence
            // exists.
            include = !racesActiveByEra.has(key);
            includeForCharacteristics = false;
          }
          if (include) {
            raceEras.push({ raceId, eraId });
          }
          if (includeForCharacteristics) {
            characteristicsEraIds.add(eraId);
          }
        }
      }
      const rulesSetIds = new Set<number>();
      const missingNames = new Set<string>();
      for (const eraId of characteristicsEraIds) {
        for (const id of rulesSetIdsByEraId.get(eraId) ?? []) {
          rulesSetIds.add(id);
        }
        for (const name of unresolvedRulesSetsByEraId.get(eraId) ?? []) {
          missingNames.add(name);
        }
      }
      if (missingNames.size > 0) {
        errors.push(
          this.importResults.error({
            item: { positionId, rulesSets: [...missingNames] },
            message: `Could not resolve rules set(s) ${[...missingNames]
              .map((name) => `"${name}"`)
              .join(
                ', ',
              )} for position ${positionId}: not upserted by the rules sets step`,
          }),
        );
      }
      if (rulesSetIds.size > 0) {
        rulesSetIdsByPositionId.set(positionId, rulesSetIds);
      }

      const result = await this.positionsImport.syncRaceEras(
        { positionId, raceEras },
        errors,
      );
      if (result) {
        imported += 1;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      rulesSetIdsByPositionId,
    };
  }
}
