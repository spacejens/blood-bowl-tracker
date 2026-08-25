import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { matchCategoryOverrideSchema } from './match-config.schema';

@Injectable()
export class MatchCategoryConfigService {
  constructor(
    private readonly eraConfig: EraConfigService,
    private readonly messages: ConfigErrorMessageService,
  ) {}

  /**
   * Explicit BBL match id -> category assignments, gathered from each era's
   * optional matches.categoryOverrides list and flattened into one map.
   * These win over MatchCategoryClassifierService's keyword classification,
   * and exist for names the keywords cannot recognize (thematic cup finals
   * such as "Bierhallentodball") or deliberately refuse to guess at. No
   * configured overrides anywhere is not an error. A match id may appear in
   * only one entry across all eras.
   */
  getCategoryOverrides(): Map<string, MatchCategory> {
    const overrides = new Map<string, MatchCategory>();
    const seenAt = new Map<string, string>();

    this.eraConfig.getEras().forEach((era, eraIndex) => {
      (era.matches?.categoryOverrides ?? []).forEach((entry, entryIndex) => {
        const location = `BBL_ERAS[${eraIndex}].matches.categoryOverrides[${entryIndex}]`;
        const parsed = matchCategoryOverrideSchema.safeParse(entry);
        if (!parsed.success) {
          throw new Error(this.messages.format(location, parsed.error));
        }
        const { matchId, category } = parsed.data;
        const existing = seenAt.get(matchId);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: match id ${matchId} has a category override in more ` +
              `than one place (${existing} and ${location}).`,
          );
        }
        seenAt.set(matchId, location);
        overrides.set(matchId, category);
      });
    });

    return overrides;
  }
}
