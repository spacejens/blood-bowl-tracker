import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';
import { leagueEntriesSchema } from './league-config.schema';

@Injectable()
export class LeagueConfigService {
  constructor(
    private readonly config: ImportBblConfigService,
    private readonly messages: ConfigErrorMessageService,
  ) {}

  /**
   * The names of every league covered by the BBL data mirror, supplied via the
   * leagues[] config array (names are not parsed from the source data). Each is
   * used as that league's external ID under both the BBL and Name external
   * systems. Order is preserved. League names must be unique.
   */
  getLeagueNames(): string[] {
    const raw = this.config.get<unknown>('leagues');
    if (raw === undefined) {
      throw new Error(
        'leagues is not set in import-bbl-config.json5. Set it to a ' +
          'non-empty array of leagues, each with a leagueName (e.g. "tLoEG").',
      );
    }
    const parsed = leagueEntriesSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0].path.length === 0
          ? 'leagues in import-bbl-config.json5 must be a non-empty array of leagues.'
          : this.messages.format('leagues', parsed.error),
      );
    }

    const names: string[] = [];
    const seen = new Set<string>();
    for (const entry of parsed.data) {
      if (seen.has(entry.leagueName)) {
        throw new Error(
          `leagues: league name "${entry.leagueName}" appears more than once.`,
        );
      }
      seen.add(entry.leagueName);
      names.push(entry.leagueName);
    }
    return names;
  }
}
