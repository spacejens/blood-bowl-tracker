import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  LeaguesImportService,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { LeagueConfigService } from './league-config.service';

@Injectable()
export class TpLeaguesImportService {
  constructor(
    private readonly config: LeagueConfigService,
    private readonly leaguesImport: LeaguesImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Import the single league the TP data covers. The name comes from the
   * league.name config key (not parsed from the data) and is used as the
   * league's external ID under two systems: TP (canonical) and Name (cross-tool
   * matching). Idempotent: re-running upserts the existing league.
   */
  async importLeague(): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    let name: string;
    try {
      name = this.config.getLeagueName();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: {
            externalSystems: [
              TP_EXTERNAL_SYSTEM_NAME,
              NAME_EXTERNAL_SYSTEM_NAME,
            ],
          },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return { result: this.importResults.result({ imported, errors }) };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: TP_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported, errors }) };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    const league = await this.leaguesImport.upsert(
      {
        name,
        externalIds: [
          { externalSystemId: tpSystemId, externalId: name },
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forLeague(name),
          },
        ],
      },
      errors,
    );
    if (league) {
      imported += 1;
    }

    return {
      result: this.importResults.result({ imported, errors }),
    };
  }
}
