import { describe, expect, it } from 'vitest';

import { KeywordValidationError } from './keyword-validation-error';

describe('KeywordValidationError', () => {
  it('carries its message and its own name', () => {
    const error = new KeywordValidationError('nope');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('nope');
    expect(error.name).toBe('KeywordValidationError');
  });
});
