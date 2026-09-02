import { Injectable } from '@nestjs/common';

/** Trailing "Team"/"Teams", BBL's own race-naming convention. */
const TEAM_SUFFIX = /\s+teams?$/;

/**
 * Compares a race's BBL and TP names. BBL names a race "<Race> Team" or
 * "<Race> Teams"; TP names the same race just "<Race>", so that suffix is a
 * known, expected difference and never a mismatch on its own. Pure and
 * dependency-free, so specs may inject it as a real provider.
 */
@Injectable()
export class RaceNameComparisonService {
  /** Lower-cased, whitespace-collapsed, with the "Team(s)" suffix removed. */
  normalize(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(TEAM_SUFFIX, '');
  }

  /** True when two source names differ only by suffix, case or whitespace. */
  agree(a: string, b: string): boolean {
    return this.normalize(a) === this.normalize(b);
  }
}
