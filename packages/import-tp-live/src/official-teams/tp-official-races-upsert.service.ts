import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { RacesService } from '@blood-bowl-tracker/game-data';
import type { TpOfficialRace } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpOfficialTeamsContext } from './tp-official-teams-context.service';

/** One upserted race, as the positions step needs it. */
export interface TpOfficialRaceRef {
  raceId: number;
  raceName: string;
}

/** Options for {@link TpOfficialRacesUpsertService.upsertRaces}. */
export interface UpsertOfficialRacesOptions {
  races: TpOfficialRace[];
  context: TpOfficialTeamsContext;
  errors: ImportError[];
}

/** What upserting one rules set's races did. */
export interface UpsertedOfficialRaces {
  imported: number;
  /** Every `teamRaceCode` of every upserted race -> that race's row. */
  racesByCode: Map<string, TpOfficialRaceRef>;
}

@Injectable()
export class TpOfficialRacesUpsertService {
  constructor(
    private readonly races: RacesService,
    private readonly nameExternalId: TpNameExternalIdService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Upserts every race on one rules set's official list, grouped by the
   * list's display name rather than `teamRaceCode`: one logical race carries
   * a different code per variant (official and legacy alike), so each group
   * upserts once with every code as a TP external id -- in one call, so the
   * external-id merge collapses them onto a single row -- plus its display
   * name as a Name external id. The race becomes available in every TP era
   * declaring the rules set; the era sync only ever adds, so a race listed
   * under several rules sets accumulates all of their eras across calls. A
   * failed upsert records one error and skips only that race.
   */
  async upsertRaces({
    races,
    context,
    errors,
  }: UpsertOfficialRacesOptions): Promise<UpsertedOfficialRaces> {
    const codesByName = new Map<string, Set<string>>();
    for (const race of races) {
      let codes = codesByName.get(race.name);
      if (codes === undefined) {
        codes = new Set();
        codesByName.set(race.name, codes);
      }
      codes.add(race.teamRaceCode);
    }

    let imported = 0;
    const racesByCode = new Map<string, TpOfficialRaceRef>();
    for (const [raceName, codes] of codesByName) {
      const upserted = await this.runner.record({
        run: () =>
          this.races.upsert({
            name: raceName,
            eras: context.eraIds,
            externalIds: [
              ...[...codes].map((code) => ({
                externalSystemId: context.tpSystemId,
                externalId: code,
              })),
              {
                externalSystemId: context.nameSystemId,
                externalId: this.nameExternalId.forRace(raceName),
              },
            ],
          }),
        item: { race: raceName, rulesSet: context.rulesSet },
        errors,
        buildErrorMessage: (error) =>
          `Failed to upsert race "${raceName}" (${context.rulesSet}): ${this.runner.messageOf(error)}`,
      });
      if (upserted === undefined) {
        continue;
      }
      imported += 1;
      for (const code of codes) {
        racesByCode.set(code, { raceId: upserted.race.id, raceName });
      }
    }
    return { imported, racesByCode };
  }
}
