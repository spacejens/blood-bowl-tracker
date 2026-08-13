import type { DataTypeReviewer as HarnessDataTypeReviewer } from '@blood-bowl-tracker/review-harness';

import type { SampledMatch } from './review.types';

export { DATA_TYPE_REVIEWERS } from '@blood-bowl-tracker/review-harness';

/**
 * One reviewable data type (v1: match events), bound to this tool's match
 * entity. The generic contract and its DI token live in
 * `@blood-bowl-tracker/review-harness`; only the entity binding is local.
 */
export type DataTypeReviewer = HarnessDataTypeReviewer<SampledMatch>;
