import type { Match } from '@blood-bowl-tracker/db';

/** The import sources this tool can review data from. */
export type ReviewSource = 'bbl' | 'tp';

/** Every source, in the order the report presents them. */
export const REVIEW_SOURCES: readonly ReviewSource[] = ['bbl', 'tp'];

/** A database match resolved for review, with the source it came from. */
export interface ReviewMatch {
  source: ReviewSource;
  /** `game_data.matches.id`. */
  matchId: number;
  /** The source's own match id, from `matches_external_ids.external_id`. */
  externalId: string;
  /** `game_data.matches.name`, e.g. "Round 3". */
  matchName: string;
  /** `game_data.competitions.name` the match belongs to. */
  competitionName: string;
  playedAt: Date;
  /**
   * `game_data.matches.category`, e.g. 'cup_final'. Always rendered in the
   * report heading, including for 'normal' — confirming that a routine match
   * really was imported as routine is exactly the kind of check this review
   * tool exists for.
   */
  category: Match['category'];
  /**
   * The paired source's own match id, for a BBL match merged from two
   * original two-team source rows. Set only by the merged-match stratifier;
   * every other stratifier and the override lookup leave it undefined.
   */
  secondaryExternalId?: string;
}

/** A `ReviewMatch` plus the human-readable reasons it was picked. */
export interface SampledMatch extends ReviewMatch {
  /** Stratum labels and/or `'override'`; never empty. */
  selectedFor: string[];
}

/** Something the report could not cover — reported, never a run failure. */
export interface ReviewGap {
  source: ReviewSource;
  reason: string;
}

/** One sampling stratum a data-type module offers. */
export interface ReviewStratum {
  /** Stable id used to look the stratum's query up. */
  id: string;
  /** Human-readable description shown in the report. */
  label: string;
  /** Sources this stratum applies to. */
  sources: readonly ReviewSource[];
}
