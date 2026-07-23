import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  LeaguesImportService,
  NAME_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { LeagueConfigService } from './league-config.service';

@Injectable()
export class BblLeaguesImportService {
  constructor(
    private readonly config: LeagueConfigService,
    private readonly leaguesImport: LeaguesImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Import every league the BBL data covers. Names come from the leagues[]
   * config (not parsed from the data); each is used as that league's external
   * ID under two systems: BBL (canonical) and Name (cross-tool matching).
   * Returns the imported leagues' ids keyed by name for the eras import to
   * resolve each era's league. Idempotent: re-running upserts existing leagues.
   */
  async importLeagues(): Promise<{
    result: ImportResult;
    leagueIdsByName: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const leagueIdsByName = new Map<string, number>();

    const bblSystemName = this.externalSystemName.getBblSystemName();

    let names: string[];
    try {
      names = this.config.getLeagueNames();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        leagueIdsByName,
      };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: bblSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        leagueIdsByName,
      };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

    for (const name of names) {
      const league = await this.leaguesImport.upsertLeague(
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
        leagueIdsByName.set(name, league.id);
        imported += 1;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      leagueIdsByName,
    };
  }
}
