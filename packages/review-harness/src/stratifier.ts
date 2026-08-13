import type { ReviewSource, ReviewStratum } from './review.types';

/**
 * DI token for the list of every registered `Stratifier`, assembled in each
 * tool's `harness.module.ts` for the same reason as `DATA_TYPE_REVIEWERS`.
 */
export const STRATIFIERS = Symbol('STRATIFIERS');

/** A request to sample entities from one stratum, for one source. */
export interface StratumSampleRequest {
  source: ReviewSource;
  /** A `ReviewStratum.id` this stratifier returned from `listStrata()`. */
  stratumId: string;
  /**
   * The requested sample size. A stratum that must report every match (e.g.
   * review-player's SPP discrepancy stratum) may return more.
   */
  limit: number;
}

/** Chooses which imported records are worth reviewing, per data type. */
export interface Stratifier<TEntity> {
  /** Every stratum this stratifier offers, in report order. */
  listStrata(): ReviewStratum[];
  /** Entities satisfying one stratum for one source. */
  sampleStratum(request: StratumSampleRequest): Promise<TEntity[]>;
}
