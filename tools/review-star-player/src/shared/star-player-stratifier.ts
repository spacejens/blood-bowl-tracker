import type { Stratifier } from '@blood-bowl-tracker/review-harness';

import type { ReviewStarPlayer } from './review.types';

export type { StratumSampleRequest } from '@blood-bowl-tracker/review-harness';
export { STRATIFIERS as STAR_PLAYER_STRATIFIERS } from '@blood-bowl-tracker/review-harness';

/**
 * A plugin that defines sampling strata and can draw a sample of star players
 * from any stratum. One per sampling strategy.
 */
export type StarPlayerStratifier = Stratifier<ReviewStarPlayer>;
