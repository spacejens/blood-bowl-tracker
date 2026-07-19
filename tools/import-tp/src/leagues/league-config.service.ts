import { Injectable } from '@nestjs/common';

import { ImportTpConfigService } from '../config/import-tp-config.service';

@Injectable()
export class LeagueConfigService {
  constructor(private readonly config: ImportTpConfigService) {}

  /**
   * The name of the single league covered by the TP data, supplied via
   * league.name in import-tp-config.json5 (not parsed from the source data).
   * Used as the league's external ID under both the TP and Name external
   * systems.
   */
  getLeagueName(): string {
    const league = this.config.get<Record<string, unknown>>('league');
    const name = league?.name;
    if (typeof name !== 'string' || name === '') {
      throw new Error(
        'league.name is not set in import-tp-config.json5. Set league.name ' +
          'to the name of the league the TP data covers (e.g. "tLoEGBBL").',
      );
    }
    return name;
  }
}
