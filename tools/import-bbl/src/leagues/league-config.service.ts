import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';

@Injectable()
export class LeagueConfigService {
  constructor(private readonly config: ImportBblConfigService) {}

  /**
   * The name of the single league covered by the BBL data mirror. Supplied via
   * the leagueName config key (the name is not parsed from the source data).
   * Used as the league's external ID under both the BBL and Name external
   * systems.
   */
  getLeagueName(): string {
    const name = this.config.get<string>('leagueName');
    if (!name) {
      throw new Error(
        'leagueName is not set in import-bbl-config.json5. Set it to the name ' +
          'of the league the BBL data covers (e.g. "tLoEG").',
      );
    }
    return name;
  }
}
