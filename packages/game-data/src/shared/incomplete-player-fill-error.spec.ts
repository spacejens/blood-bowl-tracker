import { describe, expect, it } from 'vitest';

import { IncompletePlayerFillError } from './incomplete-player-fill-error';
import { SyncBatchValidationError } from './sync-batch-validation-error';

describe('IncompletePlayerFillError', () => {
  it('is a sync batch validation error carrying its message', () => {
    const error = new IncompletePlayerFillError('Player 9 is a star player');
    expect(error).toBeInstanceOf(SyncBatchValidationError);
    expect(error.message).toBe('Player 9 is a star player');
    expect(error.name).toBe('IncompletePlayerFillError');
  });
});
