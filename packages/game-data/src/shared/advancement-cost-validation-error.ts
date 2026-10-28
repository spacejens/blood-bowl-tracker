import { SyncBatchValidationError } from './sync-batch-validation-error';

/**
 * An authored-data mistake in an advancement cost sync: one batch naming the
 * same (rules set, league, advancement number, advancement kind) key twice, a
 * cost naming a rules set, league or skill that does not exist, or a cost
 * whose kind and skill disagree.
 */
export class AdvancementCostValidationError extends SyncBatchValidationError {}
