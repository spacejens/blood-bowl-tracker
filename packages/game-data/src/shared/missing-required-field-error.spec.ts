import { describe, expect, it } from 'vitest';

import { MissingRequiredFieldError } from './missing-required-field-error';

describe('MissingRequiredFieldError', () => {
  it('extends Error and carries its message', () => {
    const err = new MissingRequiredFieldError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
  });
});
