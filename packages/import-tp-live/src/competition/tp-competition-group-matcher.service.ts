import { Injectable } from '@nestjs/common';

/**
 * The flags every curated `namePattern` is compiled with: case-insensitive,
 * and Unicode-aware so alternations such as `Säsong` behave. tools/import-manual
 * validates curated patterns with these same flags.
 */
export const NAME_PATTERN_FLAGS = 'iu';

/** A curated competition group that carries a name pattern. */
export interface NamePatternCandidate {
  id: number;
  name: string;
  namePattern: string;
}

/**
 * The outcome of matching a raw competition name: confident only when
 * exactly one group's pattern matched.
 */
export type CompetitionGroupMatch =
  | { kind: 'matched'; group: NamePatternCandidate }
  | { kind: 'unmatched' }
  | { kind: 'ambiguous'; groupNames: string[] };

/**
 * Matches a brand-new TP competition's raw source name against every curated
 * group's name pattern. Pure and dependency-free: the caller supplies the
 * candidates. Anchoring is each pattern's own job; the raw name is tested
 * as given.
 */
@Injectable()
export class TpCompetitionGroupMatcherService {
  match(
    rawName: string,
    candidates: readonly NamePatternCandidate[],
  ): CompetitionGroupMatch {
    const matched = candidates.filter((candidate) =>
      new RegExp(candidate.namePattern, NAME_PATTERN_FLAGS).test(rawName),
    );
    if (matched.length === 1) {
      return { kind: 'matched', group: matched[0] };
    }
    if (matched.length === 0) {
      return { kind: 'unmatched' };
    }
    return {
      kind: 'ambiguous',
      groupNames: matched.map((candidate) => candidate.name),
    };
  }
}
