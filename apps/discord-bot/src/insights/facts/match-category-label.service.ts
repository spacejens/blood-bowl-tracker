import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * A match category rendered for a human reader: 'season_final' ->
 * 'Season Final'. Derived from the enum value rather than a hand-written
 * table, so a new category never silently renders as its raw slug.
 */
@Injectable()
export class MatchCategoryLabelService {
  label(category: MatchCategory): string {
    const parts = (category as string)
      .split('_')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1));
    return parts.join(' ');
  }
}
