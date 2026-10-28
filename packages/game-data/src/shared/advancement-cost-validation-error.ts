import { SyncBatchValidationError } from './sync-batch-validation-error';

/**
 * An authored-data mistake in an advancement cost sync: one batch naming the
 * same (rules set, advancement number, advancement kind) key twice, or a
 * cost naming a rules set that does not exist.
 */
export class AdvancementCostValidationError extends SyncBatchValidationError {}
