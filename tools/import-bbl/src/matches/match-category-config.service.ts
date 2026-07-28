import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import { MATCH_CATEGORIES } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';

@Injectable()
export class MatchCategoryConfigService {
  constructor(private readonly eraConfig: EraConfigService) {}

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
        const { matchId, category } = this.parseEntry(entry, location);
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

  private parseEntry(
    entry: unknown,
    location: string,
  ): { matchId: string; category: MatchCategory } {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(
        `${location} must be an object of the form { matchId, category }.`,
      );
    }
    const { matchId, category } = entry as Record<string, unknown>;
    if (typeof matchId !== 'string' || matchId.trim() === '') {
      throw new Error(`${location}.matchId must be a non-empty string.`);
    }
    if (
      typeof category !== 'string' ||
      !(MATCH_CATEGORIES as readonly string[]).includes(category)
    ) {
      throw new Error(
        `${location}.category must be one of: ${MATCH_CATEGORIES.join(', ')}.`,
      );
    }
    return { matchId, category: category as MatchCategory };
  }
}
