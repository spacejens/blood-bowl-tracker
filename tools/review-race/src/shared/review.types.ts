import type { Sampled } from '@blood-bowl-tracker/review-harness';

export type {
  ReviewGap,
  ReviewSource,
  ReviewStratum,
} from '@blood-bowl-tracker/review-harness';
export { REVIEW_SOURCES } from '@blood-bowl-tracker/review-harness';

/**
 * A race the report covers. Unlike review-player's `ReviewPlayer`, this
 * carries no `source`: a race is one entity across BBL, TP and the manual
 * curation, and the whole point of the report is showing all three side by
 * side for the same race. That is also why the sampler keys its dedup on
 * `raceId` alone: when two different strata both select the same race, they
 * collapse into one `selectedFor` entry carrying both reasons instead of two
 * separate report rows.
 */
export interface ReviewRace {
  /** game_data.races.id */
  raceId: number;
  raceName: string;
}

/** A race selected for review by one or more strata. */
export type SampledRace = Sampled<ReviewRace>;
