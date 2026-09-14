import { describe, expect, it } from 'vitest';

import { LastingInjuryValidationError } from './lasting-injury-validation-error';

describe('LastingInjuryValidationError', () => {
  it('is an Error carrying the supplied message', () => {
    const error = new LastingInjuryValidationError('boom');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
  });
});
