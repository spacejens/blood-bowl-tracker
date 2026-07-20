import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  externalSystemBootstrapError,
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
  RacesImportService,
  upsertExternalSystems,
} from '@blood-bowl-tracker/import';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import { TpSourceReader } from '../source/tp-source-reader';

/** One logical race, accumulated across every roster file that names it. */
interface RaceGroup {
  raceName: string;
  codes: Set<string>;
  eraIds: Set<number>;
}

@Injectable()
export class TpRacesImportService {
  constructor(
    private readonly sourceReader: TpSourceReader,
    private readonly rosterParser: RosterParserService,
    private readonly racesImport: RacesImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import every race that appears on a TP roster file. Rosters are grouped by
   * `rosterMaster.name` (the display name), NOT by `teamRace` code, because one
   * logical race can carry several rule-set-variant codes. Each group upserts
   * once, carrying every distinct code as a TP external id (all in one call, so
   * the merge semantics collapse them onto a single row), the display name as a
   * Name external id, and every era any contributing roster was seen under.
   * Returns `raceIdsByTeamRaceCode` keyed by CODE (not name), so a roster's
   * `teamRaceCode` resolves directly to the unified race DB id for the
   * downstream positions/teams import. Idempotent.
   */
  async importRaces(eraIdsByName: Map<string, number>): Promise<{
    result: ImportResult;
    raceIdsByTeamRaceCode: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const raceIdsByTeamRaceCode = new Map<string, number>();

    let tpSystemId: number;
    let nameSystemId: number;
    const tpSystemName = this.externalSystemName.getTpSystemName();
    try {
      [tpSystemId, nameSystemId] = await upsertExternalSystems(
        this.externalSystemsImport,
        [tpSystemName, NAME_EXTERNAL_SYSTEM_NAME],
      );
    } catch (error) {
      errors.push(
        externalSystemBootstrapError(
          [tpSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          error,
        ),
      );
      return {
        result: makeImportResult({ imported, errors }),
        raceIdsByTeamRaceCode,
      };
    }

    const rosters = await collectRosters(
      this.sourceReader,
      this.rosterParser,
      errors,
    );

    const groups = new Map<string, RaceGroup>();
    for (const { roster, era } of rosters) {
      let group = groups.get(roster.raceName);
      if (!group) {
        group = {
          raceName: roster.raceName,
          codes: new Set(),
          eraIds: new Set(),
        };
        groups.set(roster.raceName, group);
      }
      group.codes.add(roster.teamRaceCode);
      const eraId = eraIdsByName.get(era);
      if (eraId === undefined) {
        errors.push(unknownEraError(era, roster));
      } else {
        group.eraIds.add(eraId);
      }
    }

    for (const group of groups.values()) {
      const data: UpsertRace = {
        name: group.raceName,
        eras: [...group.eraIds],
        externalIds: [
          ...[...group.codes].map((code) => ({
            externalSystemId: tpSystemId,
            externalId: code,
          })),
          { externalSystemId: nameSystemId, externalId: group.raceName },
        ],
      };
      const upserted = await this.racesImport.upsertRace(data, errors);
      if (upserted) {
        imported += 1;
        for (const code of group.codes) {
          raceIdsByTeamRaceCode.set(code, upserted.id);
        }
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      raceIdsByTeamRaceCode,
    };
  }
}

/**
 * Single streaming pass over every source file, parsing each `rosters` file
 * into a `TpRoster` tagged with its era. A per-file parse failure is recorded
 * and skipped; a throw from files() is recorded and the rosters collected so
 * far returned -- mirroring TpCoachesImportService.collectCoaches. Shared by the
 * races, positions and teams imports.
 */
export async function collectRosters(
  sourceReader: TpSourceReader,
  rosterParser: RosterParserService,
  errors: ImportError[],
): Promise<{ roster: TpRoster; era: string }[]> {
  const rosters: { roster: TpRoster; era: string }[] = [];
  try {
    for await (const file of sourceReader.files()) {
      if (file.type !== 'rosters') {
        continue;
      }
      try {
        rosters.push({
          roster: rosterParser.parse(file.content),
          era: file.era,
        });
      } catch (error) {
        errors.push(
          makeImportError({
            item: {
              era: file.era,
              competition: file.competition,
              filename: file.filename,
            },
            message:
              `Could not parse rosters file "${file.filename}" in ` +
              `"${file.era}/${file.competition}": ` +
              `${error instanceof Error ? error.message : String(error)}`,
          }),
        );
      }
    }
  } catch (error) {
    errors.push(
      makeImportError({
        item: { scan: 'rosters files' },
        message:
          'Could not complete the rosters file scan: ' +
          `${error instanceof Error ? error.message : String(error)}`,
      }),
    );
  }
  return rosters;
}

/** An ImportError for a roster whose era name is not among the imported eras. */
export function unknownEraError(era: string, roster: TpRoster): ImportError {
  return makeImportError({
    item: { era, roster: roster.id },
    message: `Unknown era "${era}" for roster ${roster.id}: not found among imported eras.`,
  });
}
