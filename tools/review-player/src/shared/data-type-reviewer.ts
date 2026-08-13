import type { DataTypeReviewer } from '@blood-bowl-tracker/review-harness';

import type { SampledPlayer } from './review.types';

export { DATA_TYPE_REVIEWERS as PLAYER_DATA_TYPE_REVIEWERS } from '@blood-bowl-tracker/review-harness';

/**
 * A plugin that produces the raw and imported views for one aspect of player
 * data (e.g. star player points, career stats). One per data type. The generic
 * contract and its DI token live in `@blood-bowl-tracker/review-harness`; only
 * the entity binding is local.
 */
export type PlayerDataTypeReviewer = DataTypeReviewer<SampledPlayer>;
