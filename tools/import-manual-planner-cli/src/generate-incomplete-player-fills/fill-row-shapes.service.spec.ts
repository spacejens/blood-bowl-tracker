import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { FillRowShapesService } from './fill-row-shapes.service';

describe('FillRowShapesService', () => {
  let service: FillRowShapesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FillRowShapesService],
    }).compile();
    service = moduleRef.get(FillRowShapesService);
  });

  it('keys a characteristic line by abbreviation', () => {
    expect(
      service.line({
        move: 6,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 9,
      }),
    ).toEqual({ ma: 6, st: 3, ag: 3, pa: null, av: 9 });
  });

  it('keys the characteristic formats by abbreviation', () => {
    expect(
      service.formats({
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus_zero_legal',
        armourFormat: 'plus',
      }),
    ).toEqual({
      ma: 'bare',
      st: 'bare',
      ag: 'plus',
      pa: 'plus_zero_legal',
      av: 'plus',
    });
  });

  it('writes a time as an ISO timestamp', () => {
    expect(service.iso(new Date('2024-03-01T19:00:00+00:00'))).toBe(
      '2024-03-01T19:00:00.000Z',
    );
  });

  it('refuses a missing time', () => {
    expect(() => service.iso(null)).toThrow(
      new Error('A match time the query guarantees is missing'),
    );
  });
});
