import { describe, expect, it } from 'vitest';

import { CharacteristicFormatMismatchError } from './characteristic-format-mismatch-error';

describe('CharacteristicFormatMismatchError', () => {
  it('is an Error carrying the supplied message', () => {
    const error = new CharacteristicFormatMismatchError('boom');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
  });
});
