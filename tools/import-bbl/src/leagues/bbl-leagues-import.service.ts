import { Injectable } from '@nestjs/common';
import {
  LeaguesImportService,
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
} from '@blood-bowl-tracker/import';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  NAME_EXTERNAL_SYSTEM_NAME,
} from '../source/external-system-names';
import { LeagueConfigService } from './league-config.service';

@Injectable()
export class BblLeaguesImportService {
  constructor(
    private readonly config: LeagueConfigService,
    private readonly leaguesImport: LeaguesImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
  ) {}

  /**
   * Import the single league the BBL data covers. The name comes from
   * BBL_LEAGUE_NAME (not parsed from the data) and is used as the league's
   * external ID under two systems: BBL (canonical) and Name (cross-tool
   * matching). Idempotent: re-running upserts the existing league.
   */
  async importLeague(): Promise<ImportResult> {
    let imported = 0;
    const errors: ImportError[] = [];

    let name: string;
    let bblSystemId: number;
    let nameSystemId: number;
    try {
      name = this.config.getLeagueName();
      bblSystemId = await this.externalSystemsImport.upsertExternalSystem(
        BBL_EXTERNAL_SYSTEM_NAME,
      );
      nameSystemId = await this.externalSystemsImport.upsertExternalSystem(
        NAME_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      errors.push(
        makeImportError({
          item: {
            externalSystems: [
              BBL_EXTERNAL_SYSTEM_NAME,
              NAME_EXTERNAL_SYSTEM_NAME,
            ],
          },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return makeImportResult({ imported, errors });
    }

    const success = await this.leaguesImport.upsertLeague(
      {
        name,
        externalIds: [
          { externalSystemId: bblSystemId, externalId: name },
          { externalSystemId: nameSystemId, externalId: name },
        ],
      },
      errors,
    );
    if (success) {
      imported += 1;
    }

    return makeImportResult({ imported, errors });
  }
}
