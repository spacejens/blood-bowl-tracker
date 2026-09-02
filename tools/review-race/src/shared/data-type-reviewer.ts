import type { DataTypeReviewer } from '@blood-bowl-tracker/review-harness';

import type { SampledRace } from './review.types';

export { DATA_TYPE_REVIEWERS as RACE_DATA_TYPE_REVIEWERS } from '@blood-bowl-tracker/review-harness';

/**
 * A plugin that produces the raw and imported views for one aspect of race
 * data (identity, position availability, position characteristics). The
 * generic contract and its DI token live in
 * `@blood-bowl-tracker/review-harness`; only the entity binding is local.
 */
export type RaceDataTypeReviewer = DataTypeReviewer<SampledRace>;
