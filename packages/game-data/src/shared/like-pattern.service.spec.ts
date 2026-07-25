import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LikePatternService } from './like-pattern.service';

describe('LikePatternService', () => {
  let service: LikePatternService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LikePatternService],
    }).compile();
    service = moduleRef.get(LikePatternService);
  });

  it('leaves a plain string untouched', () => {
    expect(service.escape('Reikland')).toBe('Reikland');
  });

  it('escapes percent and underscore wildcards', () => {
    expect(service.escape('50%_off')).toBe('50\\%\\_off');
  });

  it('escapes the backslash before the wildcards so it is not double-escaped', () => {
    expect(service.escape('a\\b')).toBe('a\\\\b');
    expect(service.escape('\\%')).toBe('\\\\\\%');
  });
});
