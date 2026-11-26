import {
  configGroupSchema,
  nonEmptyStringSchema,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportTpConfigService } from '../config/import-tp-config.service';

@Injectable()
export class LeagueConfigService {
  constructor(private readonly config: ImportTpConfigService) {}

  /**
   * The name of the single league covered by the TP data, supplied via
   * league.name in import-tp-config.json5 (not parsed from the source data).
   * It names a league in batch 001's curated catalog, found by its Name
   * external id, and is attached as the league's TP external id.
   */
  getLeagueName(): string {
    const league = configGroupSchema.parse(this.config.get('league'));
    const parsed = nonEmptyStringSchema.safeParse(league.name);
    if (!parsed.success) {
      throw new Error(
        'league.name is not set in import-tp-config.json5. Set league.name ' +
          'to the curated name of the league the TP data covers (e.g. "tLoEG").',
      );
    }
    return parsed.data;
  }
}
