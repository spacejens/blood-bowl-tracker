import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import { PositionPageParser } from './position-page-parser';

const POSITION_PAGE_TYPE = 'pt';

@Injectable()
export class BblPositionsImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly positionPageParser: PositionPageParser,
    private readonly positionsImport: PositionsImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import every position found on the BBL `p=pt` pages. A position page lists
   * the race(s) it can play for; one local position row is imported per
   * (position, race) pair. Each row is keyed by the composite `<typId>-<raceBblId>`
   * under the BBL external system and by `<raceName>: <positionName>` under the
   * Name external system. A race is resolved to its local id via the map
   * returned by the races import. Positions with no races, and pairings whose
   * race is not in the map, are skipped with a recorded error. Idempotent.
   */
  async importPositions(
    raceIdsByBblId: Map<string, number>,
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
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return makeImportResult({ imported, errors });
    }

    for await (const page of this.sourceReader.pages(POSITION_PAGE_TYPE)) {
      try {
        const position = this.positionPageParser.extractPosition(page);
        if (!position) {
          continue;
        }

        if (position.races.length === 0) {
          errors.push(
            makeImportError({
              item: { typId: position.typId, name: position.name },
              message: `Skipped position "${position.name}" (${position.typId}): no race listed to assign it to`,
            }),
          );
          continue;
        }

        for (const race of position.races) {
          const raceId = raceIdsByBblId.get(race.bblId);
          if (raceId === undefined) {
            errors.push(
              makeImportError({
                item: { typId: position.typId, race: race.name },
                message: `Skipped position "${position.name}" for race "${race.name}" (${race.bblId}): race not imported`,
              }),
            );
            continue;
          }

          const success = await this.positionsImport.upsertPosition(
            {
              name: position.name,
              raceId,
              externalIds: [
                {
                  externalSystemId: bblSystemId,
                  externalId: `${position.typId}-${race.bblId}`,
                },
                {
                  externalSystemId: nameSystemId,
                  externalId: `${race.name}: ${position.name}`,
                },
              ],
            },
            errors,
          );
          if (success) {
            imported += 1;
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
}
