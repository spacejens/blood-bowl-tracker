import { SyncBatchValidationError } from './sync-batch-validation-error';

/**
 * A manual fill of a missing player's data that cannot be written: the
 * player is not a non-star TP player, is already complete with different
 * data, or the entry contradicts what is stored or the SPP he reports as
 * spent. A SyncBatchValidationError, so the API answers BAD_REQUEST and the
 * importer records it against the entry.
 */
export class IncompletePlayerFillError extends SyncBatchValidationError {}
