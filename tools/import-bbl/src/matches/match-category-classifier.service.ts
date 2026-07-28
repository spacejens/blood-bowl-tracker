import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

export interface ClassifyMatchNameOptions {
  /** The BBL match id (m=<id>), used only in the thrown error message. */
  bblId: string;
  /** The free-text match name extracted by MatchTeamsPageParser. */
  name: string;
  /** The owning competition's type, which disambiguates a bare "Final". */
  competitionType: 'season' | 'cup';
}

/**
 * A keyword's category, or 'final' for the one keyword whose meaning depends
 * on the competition type (a cup's Final is a cup_final; a season's is a
 * season_final).
 */
type KeywordTarget = MatchCategory | 'final';

/**
 * Exact (normalized) match names that name a knock-out stage. English and
 * Swedish, because both appear in real BBL data. Extend this table — never
 * loosen the SUSPICIOUS guard below — when a new spelling shows up.
 */
const KEYWORDS: Record<string, KeywordTarget> = {
  final: 'final',
  finalmatch: 'final',
  semi: 'season_semi_final',
  semifinal: 'season_semi_final',
  'semi-final': 'season_semi_final',
  'semi final': 'season_semi_final',
  brons: 'season_bronze',
  bronsmatch: 'season_bronze',
  bronze: 'season_bronze',
  'bronze match': 'season_bronze',
  kval: 'season_qualifier',
  kvalmatch: 'season_qualifier',
  qualifier: 'season_qualifier',
  qualification: 'season_qualifier',
};

/**
 * Substrings that make a name look like it names a stage. A name containing
 * one of these but not matching KEYWORDS exactly is an unrecognized spelling
 * variant, not a routine match — the classifier throws rather than silently
 * calling it 'normal'. That loud failure is the whole point: a new variant
 * gets a KEYWORDS entry or a config override, never a silent guess.
 */
const SUSPICIOUS = [
  'final',
  'semi',
  'brons',
  'bronze',
  'kval',
  'qualif',
  'slutspel',
];

@Injectable()
export class MatchCategoryClassifierService {
  /**
   * The match's category, from its free-text BBL name. Returns 'normal' for
   * a name with no stage-like content at all (week ranges, month names,
   * "Match 3", thematic cup names such as "Abendessen Bier"), which is the
   * bulk of real data. Throws for a name that looks like a stage but is not
   * an exact keyword — the caller resolves those via the per-competition
   * override list (MatchCategoryConfigService) or by extending KEYWORDS.
   */
  classify(options: ClassifyMatchNameOptions): MatchCategory {
    const { bblId, name, competitionType } = options;
    const normalized = this.normalize(name);
    const target = KEYWORDS[normalized];
    if (target !== undefined) {
      if (target === 'final') {
        return competitionType === 'cup' ? 'cup_final' : 'season_final';
      }
      if (competitionType === 'cup') {
        throw new Error(
          `BBL match ${bblId}: match name "${name}" resolved via keyword ` +
            `"${normalized}" to category "${target}", which is not valid ` +
            "for a cup competition. Set the match's category explicitly " +
            'via leagues[].eras[].matches.categoryOverrides in ' +
            'import-bbl-config.json5.',
        );
      }
      return target;
    }
    if (SUSPICIOUS.some((token) => normalized.includes(token))) {
      throw new Error(
        `BBL match ${bblId}: match name "${name}" looks like a knock-out ` +
          'stage but is not a recognized keyword. Add it to the classifier ' +
          "keyword list, or set the match's category explicitly via " +
          'leagues[].eras[].matches.categoryOverrides in ' +
          'import-bbl-config.json5.',
      );
    }
    return 'normal';
  }

  /**
   * Lowercased, whitespace-collapsed, with a trailing sequence number
   * stripped: real data has both "Kval" and "Kval 1"/"Kval 2" for the same
   * stage, and a pair of semi-finals is often numbered. Stripping a trailing
   * integer is normalization, not inference — it never turns one stage into
   * another.
   */
  private normalize(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s+\d+$/, '');
  }
}
