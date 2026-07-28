import type { Match } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

/**
 * A match category rendered for a human reader: 'season_final' ->
 * 'Season Final'. Duplicated rather than shared with the Discord bot's own
 * label service on purpose: review-match reads the database directly and
 * must not take a dependency on importer or bot packages (see
 * docs/review-match/index.md). The rule is six words of title-casing, not
 * behaviour worth coupling two tools over.
 */
@Injectable()
export class MatchCategoryLabelService {
  label(category: Match['category']): string {
    return category
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
