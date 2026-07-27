import type { ReviewMatch, ReviewSource, ReviewStratum } from './review.types';

/**
 * DI token for the list of every registered `MatchStratifier`, assembled in
 * `harness.module.ts` for the same reason as `DATA_TYPE_REVIEWERS`.
 */
export const MATCH_STRATIFIERS = Symbol('MATCH_STRATIFIERS');

export interface StratumSampleRequest {
  source: ReviewSource;
  /** A `ReviewStratum.id` this stratifier returned from `listStrata()`. */
  stratumId: string;
  /** Maximum number of matches to return. */
  limit: number;
}

/** Chooses which database matches are worth reviewing, per data type. */
export interface MatchStratifier {
  /** Every stratum this stratifier offers, in report order. */
  listStrata(): ReviewStratum[];
  /** Matches satisfying one stratum for one source, most recent first. */
  sampleStratum(request: StratumSampleRequest): Promise<ReviewMatch[]>;
}
