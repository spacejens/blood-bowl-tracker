import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  animosityTargetByCode,
  AnimosityTargetService,
} from './animosity-target.service';

describe('AnimosityTargetService', () => {
  let service: AnimosityTargetService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AnimosityTargetService],
    }).compile();
    service = moduleRef.get(AnimosityTargetService);
  });

  it.each(Object.entries(animosityTargetByCode))(
    'decodes code %s to %s',
    (code, expected) => {
      expect(service.decode(code)).toBe(expected);
    },
  );

  it('decodes a code that is not in the table to undefined', () => {
    expect(service.decode('110')).toBeUndefined();
  });

  it('decodes a non-numeric value to undefined', () => {
    expect(service.decode('Goblin')).toBeUndefined();
  });

  it('has a decode test for every known Animosity target code (guards against silent shrinkage of the code map)', () => {
    expect(Object.keys(animosityTargetByCode)).toHaveLength(2);
  });
});
