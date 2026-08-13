import type { Stratifier } from '@blood-bowl-tracker/review-harness';

import type { ReviewMatch } from './review.types';

export type { StratumSampleRequest } from '@blood-bowl-tracker/review-harness';
export { STRATIFIERS as MATCH_STRATIFIERS } from '@blood-bowl-tracker/review-harness';

/** Chooses which database matches are worth reviewing, per data type. */
export type MatchStratifier = Stratifier<ReviewMatch>;
