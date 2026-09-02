import type { Stratifier } from '@blood-bowl-tracker/review-harness';

import type { ReviewRace } from './review.types';

export type { StratumSampleRequest } from '@blood-bowl-tracker/review-harness';
export { STRATIFIERS as RACE_STRATIFIERS } from '@blood-bowl-tracker/review-harness';

/**
 * A plugin that defines sampling strata (groupings) and can draw a sample of
 * races from any stratum. One per sampling strategy.
 */
export type RaceStratifier = Stratifier<ReviewRace>;
