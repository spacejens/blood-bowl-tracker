import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { PlayerPageParser } from '../players/player-page-parser';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { PositionPageParser } from './position-page-parser';

const POSITION_PAGE_TYPE = 'pt';
const PLAYER_PAGE_TYPE = 'pl';

interface ResolvedRace {
  dbId: number;
  bblId: string;
  name: string;
}

interface ExternalIdPair {
  externalSystemId: number;
  externalId: string;
}

interface RaceExternalIdsOptions {
  bblSystemId: number;
  nameSystemId: number;
  typId: string;
  race: { bblId: string; name: string };
  positionName: string;
  nameExternalId: NameExternalIdService;
}

/**
 * The BBL (`<typId>-<raceBblId>`) and Name (`<raceName>: <positionName>`)
 * external ids for one (position, race) pairing.
 */
function raceExternalIds(options: RaceExternalIdsOptions): ExternalIdPair[] {
  const {
    bblSystemId,
    nameSystemId,
    typId,
    race,
    positionName,
    nameExternalId,
  } = options;
  return [
    { externalSystemId: bblSystemId, externalId: `${typId}-${race.bblId}` },
    {
      externalSystemId: nameSystemId,
      externalId: nameExternalId.forPosition(race.name, positionName),
    },
  ];
}

@Injectable()
export class BblPositionsImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly positionPageParser: PositionPageParser,
    private readonly playerPageParser: PlayerPageParser,
    private readonly positionsImport: PositionsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
    private readonly pageParseError: PageParseErrorService,
  ) {}

  /**
   * A `p=pt` page's own race links are incomplete, so player pages are also
   * scanned to reverse-engineer additional races fielding the position
   * (matched by typId), deduped against the listed ones. Extra races follow
   * the zero-listed-races convention: one row with a bare-name `Name` external
   * id when the page carries the `None (star player)` marker, otherwise one
   * row per race.
   *
   * No relation is marked deleted here. Every race a row is upserted for is
   * accumulated into `positionRaceCandidates` for the era-availability
   * heuristic in Phase 2 to rule on.
   */
  async importPositions(
    racesByBblId: Map<string, { id: number; name: string }>,
    teamRaceIdsByCode: Map<string, number>,
  ): Promise<{
    result: ImportResult;
    positionRaceCandidates: Map<
      number,
      { isStarPlayer: boolean; raceDbIds: Set<number> }
    >;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const positionRaceCandidates = new Map<
      number,
      { isStarPlayer: boolean; raceDbIds: Set<number> }
    >();
    const recordCandidate = (
      positionId: number,
      isStarPlayer: boolean,
      raceDbIds: number[],
    ) => {
      const existing = positionRaceCandidates.get(positionId);
      if (existing) {
        existing.isStarPlayer = existing.isStarPlayer || isStarPlayer;
        for (const id of raceDbIds) existing.raceDbIds.add(id);
      } else {
        positionRaceCandidates.set(positionId, {
          isStarPlayer,
          raceDbIds: new Set(raceDbIds),
        });
      }
    };

    const bblSystemName = this.externalSystemName.getBblSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap(
      [
        { name: bblSystemName, category: 'imported_data_source' },
        NAME_EXTERNAL_SYSTEM,
      ],
      'Failed to upsert external system: ',
    );
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        positionRaceCandidates,
      };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

    const raceInfoByDbId = new Map<number, { bblId: string; name: string }>();
    for (const [bblId, info] of racesByBblId) {
      raceInfoByDbId.set(info.id, { bblId, name: info.name });
    }

    const teamCodesByTypId = await this.scanPlayers();

    const resolveRaces = (typId: string): ResolvedRace[] => {
      const codes = teamCodesByTypId.get(typId);
      if (!codes) {
        return [];
      }
      const byDbId = new Map<number, ResolvedRace>();
      for (const code of codes) {
        const dbId = teamRaceIdsByCode.get(code);
        if (dbId === undefined) {
          errors.push(
            this.importResults.error({
              item: { typId, teamCode: code },
              message: `Could not resolve a race for team code "${code}" (position typId ${typId}): team code not in teamRaceIdsByCode`,
            }),
          );
          continue;
        }
        if (byDbId.has(dbId)) {
          continue;
        }
        const info = raceInfoByDbId.get(dbId);
        if (!info) {
          errors.push(
            this.importResults.error({
              item: { typId, raceDbId: dbId },
              message: `Could not resolve a race for db id ${dbId} (position typId ${typId}): race info missing from racesByBblId`,
            }),
          );
          continue;
        }
        byDbId.set(dbId, { dbId, bblId: info.bblId, name: info.name });
      }
      return [...byDbId.values()];
    };

    for await (const page of this.sourceReader.pages(POSITION_PAGE_TYPE)) {
      try {
        const position = this.positionPageParser.extractPosition(page);
        if (!position) {
          continue;
        }

        const listedBblIds = new Set(position.races.map((r) => r.bblId));

        for (const race of position.races) {
          const dbId = racesByBblId.get(race.bblId)?.id;
          if (dbId === undefined) {
            errors.push(
              this.importResults.error({
                item: { typId: position.typId, race: race.name },
                message: `Skipped position "${position.name}" for race "${race.name}" (${race.bblId}): race not imported`,
              }),
            );
            continue;
          }
          const upserted = await this.positionsImport.upsert(
            {
              name: position.name,
              isStarPlayer: false,
              externalIds: raceExternalIds({
                bblSystemId,
                nameSystemId,
                typId: position.typId,
                race,
                positionName: position.name,
                nameExternalId: this.nameExternalId,
              }),
            },
            errors,
          );
          if (upserted) {
            imported += 1;
            recordCandidate(upserted.id, false, [dbId]);
          }
        }

        const resolved = resolveRaces(position.typId).filter(
          (race) => !listedBblIds.has(race.bblId),
        );

        if (position.races.length === 0 && resolved.length === 0) {
          errors.push(
            this.importResults.error({
              item: { typId: position.typId, name: position.name },
              message: `Skipped position "${position.name}" (${position.typId}): no race listed and none resolvable from player history`,
            }),
          );
          continue;
        }

        if (resolved.length === 0) {
          continue;
        }

        if (position.isStarPlayer) {
          const externalIds: ExternalIdPair[] = [
            {
              externalSystemId: nameSystemId,
              externalId: this.nameExternalId.forStarPosition(position.name),
            },
            ...resolved.flatMap((race) =>
              raceExternalIds({
                bblSystemId,
                nameSystemId,
                typId: position.typId,
                race,
                positionName: position.name,
                nameExternalId: this.nameExternalId,
              }),
            ),
          ];
          const upserted = await this.positionsImport.upsert(
            {
              name: position.name,
              isStarPlayer: true,
              externalIds,
            },
            errors,
          );
          if (upserted) {
            imported += 1;
            recordCandidate(
              upserted.id,
              true,
              resolved.map((r) => r.dbId),
            );
          }
        } else {
          for (const race of resolved) {
            const upserted = await this.positionsImport.upsert(
              {
                name: position.name,
                isStarPlayer: false,
                externalIds: raceExternalIds({
                  bblSystemId,
                  nameSystemId,
                  typId: position.typId,
                  race,
                  positionName: position.name,
                  nameExternalId: this.nameExternalId,
                }),
              },
              errors,
            );
            if (upserted) {
              imported += 1;
              recordCandidate(upserted.id, false, [race.dbId]);
            }
          }
        }
      } catch (error) {
        errors.push(this.pageParseError.build(page.params, 'position', error));
        continue;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      positionRaceCandidates,
    };
  }

  /** Pre-scan every player page into a map of position typId -> team codes. */
  private async scanPlayers(): Promise<Map<string, Set<string>>> {
    const teamCodesByTypId = new Map<string, Set<string>>();
    for await (const page of this.sourceReader.pages(PLAYER_PAGE_TYPE)) {
      const player = this.playerPageParser.extractPlayer(page);
      if (!player) {
        continue;
      }
      let codes = teamCodesByTypId.get(player.typId);
      if (!codes) {
        codes = new Set<string>();
        teamCodesByTypId.set(player.typId, codes);
      }
      codes.add(player.teamCode);
    }
    return teamCodesByTypId;
  }
}
