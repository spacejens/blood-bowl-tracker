import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { PlayerPageParser } from '../players/player-page-parser';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
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

/**
 * The BBL (`<typId>-<raceBblId>`) and Name (`<raceName>: <positionName>`)
 * external ids for one (position, race) pairing.
 */
function raceExternalIds(
  bblSystemId: number,
  nameSystemId: number,
  typId: string,
  race: { bblId: string; name: string },
  positionName: string,
): ExternalIdPair[] {
  return [
    { externalSystemId: bblSystemId, externalId: `${typId}-${race.bblId}` },
    {
      externalSystemId: nameSystemId,
      externalId: `${race.name}: ${positionName}`,
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
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import every position found on the BBL `p=pt` pages.
   *
   * - Pages that list race(s) via `p=tl#` links import one position row per
   *   race (isStarPlayer false, each relation isDeleted false), keyed by the
   *   composite `<typId>-<raceBblId>` (BBL) and `<raceName>: <positionName>`
   *   (Name), as before.
   * - Pages that list no race are reverse-engineered from player pages: each
   *   player of the position (matched by typId) belongs to a team whose race is
   *   known via `teamRaceIdsByCode`. If the page carries the `None (star player)`
   *   marker, the position imports as ONE row with a positions_races row per
   *   resolved race (isDeleted false) plus a bare-name Name external id.
   *   Otherwise (a defunct-race position) it imports as duplicate rows, one per
   *   resolved race, each relation isDeleted true.
   * - Positions that resolve to no race (none listed and no player found) are
   *   skipped with a recorded error, as before.
   *
   * `racesByBblId` (from the races import) resolves a listed race's BBL id and
   * gives, inverted, the BBL id + name for a DB race id resolved via players.
   * Idempotent.
   */
  async importPositions(
    racesByBblId: Map<string, { id: number; name: string }>,
    teamRaceIdsByCode: Map<string, number>,
  ): Promise<ImportResult> {
    let imported = 0;
    const errors: ImportError[] = [];

    let bblSystemId: number;
    let nameSystemId: number;
    const bblSystemName = this.externalSystemName.getBblSystemName();
    try {
      bblSystemId =
        await this.externalSystemsImport.upsertExternalSystem(bblSystemName);
      nameSystemId = await this.externalSystemsImport.upsertExternalSystem(
        NAME_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      errors.push(
        makeImportError({
          item: {
            externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          },
          message: `Failed to upsert external system: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }),
      );
      return makeImportResult({ imported, errors });
    }

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
        if (dbId === undefined || byDbId.has(dbId)) {
          continue;
        }
        const info = raceInfoByDbId.get(dbId);
        if (!info) {
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

        if (position.races.length > 0) {
          for (const race of position.races) {
            const dbId = racesByBblId.get(race.bblId)?.id;
            if (dbId === undefined) {
              errors.push(
                makeImportError({
                  item: { typId: position.typId, race: race.name },
                  message: `Skipped position "${position.name}" for race "${race.name}" (${race.bblId}): race not imported`,
                }),
              );
              continue;
            }
            if (
              await this.positionsImport.upsertPosition(
                {
                  name: position.name,
                  isStarPlayer: false,
                  races: [{ raceId: dbId, isDeleted: false }],
                  externalIds: raceExternalIds(
                    bblSystemId,
                    nameSystemId,
                    position.typId,
                    race,
                    position.name,
                  ),
                },
                errors,
              )
            ) {
              imported += 1;
            }
          }
          continue;
        }

        const resolved = resolveRaces(position.typId);
        if (resolved.length === 0) {
          errors.push(
            makeImportError({
              item: { typId: position.typId, name: position.name },
              message: `Skipped position "${position.name}" (${position.typId}): no race listed and none resolvable from player history`,
            }),
          );
          continue;
        }

        if (position.isStarPlayer) {
          const externalIds: ExternalIdPair[] = [
            { externalSystemId: nameSystemId, externalId: position.name },
            ...resolved.flatMap((race) =>
              raceExternalIds(
                bblSystemId,
                nameSystemId,
                position.typId,
                race,
                position.name,
              ),
            ),
          ];
          if (
            await this.positionsImport.upsertPosition(
              {
                name: position.name,
                isStarPlayer: true,
                races: resolved.map((r) => ({
                  raceId: r.dbId,
                  isDeleted: false,
                })),
                externalIds,
              },
              errors,
            )
          ) {
            imported += 1;
          }
        } else {
          for (const race of resolved) {
            if (
              await this.positionsImport.upsertPosition(
                {
                  name: position.name,
                  isStarPlayer: false,
                  races: [{ raceId: race.dbId, isDeleted: true }],
                  externalIds: raceExternalIds(
                    bblSystemId,
                    nameSystemId,
                    position.typId,
                    race,
                    position.name,
                  ),
                },
                errors,
              )
            ) {
              imported += 1;
            }
          }
        }
      } catch (error) {
        errors.push(
          makeImportError({
            item: { page: page.params },
            message: `Failed to parse position page ${JSON.stringify(page.params)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          }),
        );
        continue;
      }
    }

    return makeImportResult({ imported, errors });
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
