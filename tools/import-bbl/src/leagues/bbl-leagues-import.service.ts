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
   * Attach the BBL external id to every league the BBL data covers. Names
   * come from the leagues[] config (not parsed from the data). The league
   * itself is curated (batch 001): this step finds it by its Name external
   * id and adds the same name under the BBL system, sending no name of its
   * own. A league missing from the catalog fails with the server's
   * missing-field error, recorded for that league, and the step moves on to
   * the next. Idempotent.
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
          externalIds: [
            {
              externalSystemId: nameSystemId,
              externalId: this.nameExternalId.forLeague(name),
            },
            { externalSystemId: bblSystemId, externalId: name },
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
