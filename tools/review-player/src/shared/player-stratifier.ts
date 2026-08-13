import type { Stratifier } from '@blood-bowl-tracker/review-harness';

import type { ReviewPlayer } from './review.types';

export type { StratumSampleRequest } from '@blood-bowl-tracker/review-harness';
export { STRATIFIERS as PLAYER_STRATIFIERS } from '@blood-bowl-tracker/review-harness';

/**
 * A plugin that defines sampling strata (groupings) and can draw a sample of
 * players from any stratum, for review. One per sampling strategy (e.g.
 * "random sample of all players", "top N by one metric").
 */
export type PlayerStratifier = Stratifier<ReviewPlayer>;
