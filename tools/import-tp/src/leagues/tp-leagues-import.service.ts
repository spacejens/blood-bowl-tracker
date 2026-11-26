import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  LeaguesImportService,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
  TP_EXTERNAL_SYSTEM,
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
   * Attach the TP external id to the single league the TP data covers. The
   * name comes from the league.name config key (not parsed from the data).
   * The league itself is curated (batch 001): this step finds it by its Name
   * external id and adds the same name under the TP system, sending no name
   * of its own. Because batch 001 holds that Name id, the TP league lands on
   * the curated tLoEG row whether or not the BBL importer ran first. A league
   * missing from the catalog fails with the server's missing-field error,
   * recorded for that league. Idempotent.
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
      TP_EXTERNAL_SYSTEM,
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported, errors }) };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    const league = await this.leaguesImport.upsert(
      {
        externalIds: [
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forLeague(name),
          },
          { externalSystemId: tpSystemId, externalId: name },
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
