import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';

@Injectable()
export class LeagueConfigService {
  constructor(private readonly config: ImportBblConfigService) {}

  /**
   * The names of every league covered by the BBL data mirror, supplied via the
   * leagues[] config array (names are not parsed from the source data). Each is
   * used as that league's external ID under both the BBL and Name external
   * systems. Order is preserved. League names must be unique.
   */
  getLeagueNames(): string[] {
    const leagues = this.config.get<unknown>('leagues');
    if (leagues === undefined) {
      throw new Error(
        'leagues is not set in import-bbl-config.json5. Set it to a ' +
          'non-empty array of leagues, each with a leagueName (e.g. "tLoEG").',
      );
    }
    if (!Array.isArray(leagues) || leagues.length === 0) {
      throw new Error(
        'leagues in import-bbl-config.json5 must be a non-empty array of leagues.',
      );
    }
    const names: string[] = [];
    const seen = new Set<string>();
    leagues.forEach((entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(`leagues[${index}] must be an object.`);
      }
      const name = (entry as Record<string, unknown>).leagueName;
      if (typeof name !== 'string' || name.trim() === '') {
        throw new Error(
          `leagues[${index}].leagueName must be a non-empty string.`,
        );
      }
      if (seen.has(name)) {
        throw new Error(
          `leagues: league name "${name}" appears more than once.`,
        );
      }
      seen.add(name);
      names.push(name);
    });
    return names;
  }
}
