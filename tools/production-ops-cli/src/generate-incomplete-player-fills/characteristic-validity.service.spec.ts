import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicValidityService } from './characteristic-validity.service';
import type {
  CharacteristicFormats,
  CharacteristicLine,
} from './fill-plan.types';

const BB2020: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'plus',
  pa: 'plus_zero_legal',
  av: 'plus',
};
const CRP: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'bare',
  pa: 'absent',
  av: 'bare',
};
const LINE: CharacteristicLine = { ma: 6, st: 3, ag: 3, pa: 4, av: 9 };

describe('CharacteristicValidityService', () => {
  let service: CharacteristicValidityService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CharacteristicValidityService],
    }).compile();
    service = moduleRef.get(CharacteristicValidityService);
  });

  it('accepts a target-number line', () => {
    expect(service.isValid({ line: LINE, formats: BB2020 })).toBe(true);
  });

  it('accepts a bare line with no Passing', () => {
    expect(
      service.isValid({
        line: { ma: 6, st: 3, ag: 3, pa: null, av: 8 },
        formats: CRP,
      }),
    ).toBe(true);
  });

  it.each(['ma', 'st', 'av', 'ag'] as const)('refuses a %s below 1', (key) => {
    expect(
      service.isValid({ line: { ...LINE, [key]: 0 }, formats: BB2020 }),
    ).toBe(false);
  });

  it('refuses a bare agility below 1', () => {
    expect(
      service.isValid({ line: { ...LINE, ag: 0, pa: null }, formats: CRP }),
    ).toBe(false);
  });

  it('refuses a target worse than 6+', () => {
    expect(service.isValid({ line: { ...LINE, ag: 7 }, formats: BB2020 })).toBe(
      false,
    );
  });

  it('accepts a structural zero passing only where the format allows it', () => {
    const line = { ...LINE, pa: 0 };
    expect(service.isValid({ line, formats: BB2020 })).toBe(true);
    expect(service.isValid({ line, formats: { ...BB2020, pa: 'plus' } })).toBe(
      false,
    );
  });

  it('refuses a passing value the format says is absent, and a missing one it says is present', () => {
    expect(service.isValid({ line: LINE, formats: CRP })).toBe(false);
    expect(
      service.isValid({ line: { ...LINE, pa: null }, formats: BB2020 }),
    ).toBe(false);
  });

  it('refuses an agility the rules set has no format for', () => {
    expect(
      service.isValid({ line: LINE, formats: { ...BB2020, ag: 'absent' } }),
    ).toBe(false);
  });
});
