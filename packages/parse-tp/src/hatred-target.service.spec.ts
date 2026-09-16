import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  hatredTargetByCode,
  HatredTargetService,
} from './hatred-target.service';

describe('HatredTargetService', () => {
  let service: HatredTargetService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [HatredTargetService],
    }).compile();
    service = moduleRef.get(HatredTargetService);
  });

  it.each(Object.entries(hatredTargetByCode))(
    'decodes code %s to %s',
    (code, expected) => {
      expect(service.decode(code)).toBe(expected);
    },
  );

  it('decodes a code that is not in the table to undefined', () => {
    // 111 and 999 are real type-3 values the downloaded mirror carries on
    // Animosity; they are deliberately absent from this table, and the
    // importer must keep reporting them unresolved rather than mislabel them.
    expect(service.decode('111')).toBeUndefined();
    expect(service.decode('999')).toBeUndefined();
  });

  it('decodes a non-numeric value to undefined', () => {
    expect(service.decode('Undead')).toBeUndefined();
  });

  it('has a decode test for every known Hatred target code (guards against silent shrinkage of the code map)', () => {
    expect(Object.keys(hatredTargetByCode)).toHaveLength(6);
  });
});
