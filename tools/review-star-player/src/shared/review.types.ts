import type { Sampled } from '@blood-bowl-tracker/review-harness';

export type {
  ReviewGap,
  ReviewSource,
  ReviewStratum,
} from '@blood-bowl-tracker/review-harness';
export { REVIEW_SOURCES } from '@blood-bowl-tracker/review-harness';

/**
 * A star player the report covers. A star is not a `players` row: it is a
 * `positions` row with `is_star_player = true`, so its identity is its
 * `positions.id` and its display name is `positions.name`.
 *
 * Carries no `source`, for the same reason `review-race`'s `ReviewRace` does
 * not: a star is one entity across BBL, TP and the curated files, and the
 * whole point of the report is showing all three side by side. That is also
 * why the sampler dedups on `positionId` alone.
 */
export interface ReviewStarPlayer {
  /** game_data.positions.id, with is_star_player = true */
  positionId: number;
  positionName: string;
}

/** A star player selected for review by one or more strata. */
export type SampledStarPlayer = Sampled<ReviewStarPlayer>;
