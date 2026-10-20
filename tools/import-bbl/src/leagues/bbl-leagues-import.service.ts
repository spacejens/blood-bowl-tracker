import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  ExternalSystemBootstrapService,
  ImportResultService,
  LeaguesImportService,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { LeagueConfigService } from './league-config.service';

@Injectable()
export class BblLeaguesImportService {
  constructor(
    private readonly config: LeagueConfigService,
    private readonly leaguesImport: LeaguesImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Import every league the BBL data covers. Names come from the leagues[]
   * config (not parsed from the data); each is used as that league's external
   * ID under two systems: BBL (canonical) and Name (cross-tool matching). The
   * eras import resolves each era's league server-side, by that same external
   * id, once this step has upserted it. Idempotent: re-running upserts
   * existing leagues.
   */
  async importLeagues(): Promise<{
    result: ImportResult;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];

    let names: string[];
    try {
      names = this.config.getLeagueNames();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: {
            externalSystems: [
              BBL_EXTERNAL_SYSTEM_NAME,
              NAME_EXTERNAL_SYSTEM_NAME,
            ],
          },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
      };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: BBL_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
      };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

    for (const name of names) {
      const league = await this.leaguesImport.upsert(
        {
          name,
          externalIds: [
            { externalSystemId: bblSystemId, externalId: name },
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
    }

    return {
      result: this.importResults.result({ imported, errors }),
    };
  }
}
