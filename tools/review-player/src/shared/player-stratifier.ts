import type { ReviewPlayer, ReviewSource, ReviewStratum } from './review.types';

/**
 * DI token for the array of player stratifiers. NestJS has no multi-provider
 * pattern (no `@Multiple()` decorator), so the list is assembled by hand in
 * `harness.module.ts`, not by the framework.
 */
export const PLAYER_STRATIFIERS = Symbol('PLAYER_STRATIFIERS');

/** A request to sample players from a specific stratum. */
export interface StratumSampleRequest {
  source: ReviewSource;
  stratumId: string;
  limit: number;
}

/**
 * A plugin that defines sampling strata (groupings) and can draw a random
 * sample of players from any stratum, for review. One per sampling strategy
 * (e.g. "random sample of all players", "top N by one metric").
 */
export interface PlayerStratifier {
  /** The strata this stratifier defines. */
  listStrata(): ReviewStratum[];
  /** Sample up to `limit` players from the stratum. */
  sampleStratum(request: StratumSampleRequest): Promise<ReviewPlayer[]>;
}
