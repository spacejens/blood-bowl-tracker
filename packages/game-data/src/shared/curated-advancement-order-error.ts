import { SyncBatchValidationError } from './sync-batch-validation-error';

/**
 * A hand-curated advancement order that does not fit what is stored for the
 * player, or the SPP the player reports as spent. A SyncBatchValidationError,
 * so the API answers BAD_REQUEST and the importer records it against the
 * entry.
 */
export class CuratedAdvancementOrderError extends SyncBatchValidationError {}
