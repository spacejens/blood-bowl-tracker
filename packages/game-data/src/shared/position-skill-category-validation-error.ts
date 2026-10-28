import { SyncBatchValidationError } from './sync-batch-validation-error';

/**
 * An authored-data mistake in a position skill-category sync: a pair with no
 * characteristics recorded, a trait or unique category, a category listed
 * twice for one pair, or one batch naming the same pair twice. It extends
 * SyncBatchValidationError, which the API maps to BAD_REQUEST. It is its own
 * class so that the error names the right domain.
 */
export class PositionSkillCategoryValidationError extends SyncBatchValidationError {}
