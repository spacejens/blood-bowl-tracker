import { SyncBatchValidationError } from './sync-batch-validation-error';

/**
 * An authored-data mistake in an SPP award table sync: one batch naming the
 * same (rules set, race, action type) key twice (a null race, the rules
 * set's baseline, is a key of its own), or a value naming a rules set or
 * race that does not exist.
 */
export class SppAwardValueValidationError extends SyncBatchValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'SppAwardValueValidationError';
  }
}
