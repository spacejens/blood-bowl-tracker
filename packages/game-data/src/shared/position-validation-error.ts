import { SyncBatchValidationError } from './sync-batch-validation-error';

/**
 * An authored-data mistake in a position sync: a characteristics batch
 * naming the same (position, rules set) pair twice, or a race/era
 * availability sync naming a position that does not exist or a race/era pair
 * with no `race_eras` row.
 *
 * Separate from CharacteristicFormatMismatchError, which keeps its one
 * meaning: characteristics that disagree with what their rules set declares.
 */
export class PositionValidationError extends SyncBatchValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'PositionValidationError';
  }
}
