import type { DataTypeReviewer } from '@blood-bowl-tracker/review-harness';

import type { SampledStarPlayer } from './review.types';

export { DATA_TYPE_REVIEWERS as STAR_PLAYER_DATA_TYPE_REVIEWERS } from '@blood-bowl-tracker/review-harness';

/**
 * A plugin that produces the raw and imported views for one panel pair of
 * the star player report (the stacked star-player pair, hire eligibility).
 * The generic contract and its DI token live in `@blood-bowl-tracker/review-harness`;
 * only the entity binding is local.
 */
export type StarPlayerDataTypeReviewer = DataTypeReviewer<SampledStarPlayer>;
