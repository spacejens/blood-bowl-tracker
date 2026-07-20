import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  LeaguesImportService,
  makeImportError,
  makeImportResult,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import { LeagueConfigService } from './league-config.service';

@Injectable()
export class BblLeaguesImportService {
  constructor(
    private readonly config: LeagueConfigService,
    private readonly leaguesImport: LeaguesImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import the single league the BBL data covers. The name comes from the
   * leagueName config key (not parsed from the data) and is used as the league's
   * external ID under two systems: BBL (canonical) and Name (cross-tool
   * matching). Idempotent: re-running upserts the existing league.
   */
  async importLeague(): Promise<{ result: ImportResult; leagueId?: number }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const bblSystemName = this.externalSystemName.getBblSystemName();

    let name: string;
    try {
      name = this.config.getLeagueName();
    } catch (error) {
      errors.push(
        makeImportError({
          item: { externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return { result: makeImportResult({ imported, errors }) };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      bblSystemName,
      NAME_EXTERNAL_SYSTEM_NAME,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: makeImportResult({ imported, errors }) };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

    const league = await this.leaguesImport.upsertLeague(
      {
        name,
        externalIds: [
          { externalSystemId: bblSystemId, externalId: name },
          { externalSystemId: nameSystemId, externalId: name },
        ],
      },
      errors,
    );
    if (league) {
      imported += 1;
    }

    return {
      result: makeImportResult({ imported, errors }),
      leagueId: league?.id,
    };
  }
}
