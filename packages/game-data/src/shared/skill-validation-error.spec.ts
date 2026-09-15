import { describe, expect, it } from 'vitest';

import { SkillValidationError } from './skill-validation-error';

describe('SkillValidationError', () => {
  it('is an Error carrying its message', () => {
    const error = new SkillValidationError('Skill 7 is not available');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Skill 7 is not available');
  });
});
