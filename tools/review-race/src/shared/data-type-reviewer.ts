import type { DataTypeReviewer } from '@blood-bowl-tracker/review-harness';

import type { SampledRace } from './review.types';

export { DATA_TYPE_REVIEWERS as RACE_DATA_TYPE_REVIEWERS } from '@blood-bowl-tracker/review-harness';

/**
 * A plugin that produces the raw and imported views for one panel pair of a
 * race's report (race-and-availability, position-details). The generic
 * contract and its DI token live in `@blood-bowl-tracker/review-harness`;
 * only the entity binding is local.
 */
export type RaceDataTypeReviewer = DataTypeReviewer<SampledRace>;
