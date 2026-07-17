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
import {
  externalSystemBootstrapError,
  upsertExternalSystems,
} from '../source/external-system-bootstrap';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import { pageParseError } from '../source/page-parse-error';
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
   *   race (isStarPlayer false), keyed by the composite `<typId>-<raceBblId>`
   *   (BBL) and `<raceName>: <positionName>` (Name), as before.
   * - Regardless of whether races are listed, player pages are scanned to
   *   reverse-engineer any ADDITIONAL race(s) that field the position (matched
   *   by typId via `teamRaceIdsByCode`), deduped against the listed races. Any
   *   extra race imports under the zero-listed-races convention: if the page
   *   carries the `None (star player)` marker, ONE row with a bare-name Name
   *   external id plus the composite external ids for every extra race;
   *   otherwise duplicate rows, one per extra race.
   * - Positions that list no race and resolve to none from player history are
   *   skipped with a recorded error, as before.
   * - No relation is recorded as deleted at import time any more: every race
   *   a position row is upserted for (listed or reverse-engineered) is
   *   instead accumulated into `positionRaceCandidates`, keyed by the
   *   upserted DB position id, for a later era-availability heuristic
   *   (Phase 2) to decide which candidate races are actually available.
   *
   * `racesByBblId` (from the races import) resolves a listed race's BBL id and
   * gives, inverted, the BBL id + name for a DB race id resolved via players.
   * Idempotent.
   */
  async importPositions(
    racesByBblId: Map<string, { id: number; name: string }>,
    teamRaceIdsByCode: Map<string, number>,
  ): Promise<{
    result: ImportResult;
    positionIdsByBblId: Map<string, number>;
    positionRaceCandidates: Map<
      number,
      { isStarPlayer: boolean; raceDbIds: Set<number> }
    >;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const positionIdsByBblId = new Map<string, number>();
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

    let bblSystemId: number;
    let nameSystemId: number;
    const bblSystemName = this.externalSystemName.getBblSystemName();
    try {
      [bblSystemId, nameSystemId] = await upsertExternalSystems(
        this.externalSystemsImport,
        [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
      );
    } catch (error) {
      errors.push(
        externalSystemBootstrapError(
          [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          error,
          'Failed to upsert external system: ',
        ),
      );
      return {
        result: makeImportResult({ imported, errors }),
        positionIdsByBblId,
        positionRaceCandidates,
      };
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
        if (dbId === undefined) {
          errors.push(
            makeImportError({
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
            makeImportError({
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
              makeImportError({
                item: { typId: position.typId, race: race.name },
                message: `Skipped position "${position.name}" for race "${race.name}" (${race.bblId}): race not imported`,
              }),
            );
            continue;
          }
          const upserted = await this.positionsImport.upsertPosition(
            {
              name: position.name,
              isStarPlayer: false,
              externalIds: raceExternalIds(
                bblSystemId,
                nameSystemId,
                position.typId,
                race,
                position.name,
              ),
            },
            errors,
          );
          if (upserted) {
            imported += 1;
            positionIdsByBblId.set(
              `${position.typId}-${race.bblId}`,
              upserted.id,
            );
            recordCandidate(upserted.id, false, [dbId]);
          }
        }

        const resolved = resolveRaces(position.typId).filter(
          (race) => !listedBblIds.has(race.bblId),
        );

        if (position.races.length === 0 && resolved.length === 0) {
          errors.push(
            makeImportError({
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
          const upserted = await this.positionsImport.upsertPosition(
            {
              name: position.name,
              isStarPlayer: true,
              externalIds,
            },
            errors,
          );
          if (upserted) {
            imported += 1;
            for (const race of resolved) {
              positionIdsByBblId.set(
                `${position.typId}-${race.bblId}`,
                upserted.id,
              );
            }
            recordCandidate(
              upserted.id,
              true,
              resolved.map((r) => r.dbId),
            );
          }
        } else {
          for (const race of resolved) {
            const upserted = await this.positionsImport.upsertPosition(
              {
                name: position.name,
                isStarPlayer: false,
                externalIds: raceExternalIds(
                  bblSystemId,
                  nameSystemId,
                  position.typId,
                  race,
                  position.name,
                ),
              },
              errors,
            );
            if (upserted) {
              imported += 1;
              positionIdsByBblId.set(
                `${position.typId}-${race.bblId}`,
                upserted.id,
              );
              recordCandidate(upserted.id, false, [race.dbId]);
            }
          }
        }
      } catch (error) {
        errors.push(pageParseError(page.params, 'position', error));
        continue;
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      positionIdsByBblId,
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
