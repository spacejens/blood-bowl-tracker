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
    eraIdsByRaceId,
    positionsUsedByEra,
    racesActiveByEra,
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
      for (const raceId of candidate.raceDbIds) {
        for (const eraId of eraIdsByRaceId.get(raceId) ?? []) {
          const key = `${raceId}:${eraId}`;
          const override = overrides?.get(key);
          let include: boolean;
          if (override !== undefined) {
            include = override;
          } else if (candidate.isStarPlayer) {
            include = true;
          } else if (positionsUsedByEra.has(`${positionId}:${eraId}`)) {
            include = true;
          } else {
            include = !racesActiveByEra.has(key);
          }
          if (include) {
            raceEras.push({ raceId, eraId });
          }
        }
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
}
