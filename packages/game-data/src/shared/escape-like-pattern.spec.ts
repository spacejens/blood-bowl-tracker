import { describe, expect, it } from 'vitest';

import { escapeLikePattern } from './escape-like-pattern';

describe('escapeLikePattern', () => {
  it('leaves a plain string untouched', () => {
    expect(escapeLikePattern('Reikland')).toBe('Reikland');
  });

  it('escapes percent and underscore wildcards', () => {
    expect(escapeLikePattern('50%_off')).toBe('50\\%\\_off');
  });

  it('escapes the backslash before the wildcards so it is not double-escaped', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
  });
});
