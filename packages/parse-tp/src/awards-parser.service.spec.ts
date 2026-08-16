import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AwardsParserService } from './awards-parser.service';

describe('AwardsParserService', () => {
  let service: AwardsParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AwardsParserService],
    }).compile();
    service = moduleRef.get(AwardsParserService);
  });

  it('parses every award across every category, keeping the roster id', () => {
    const content = {
      '6196': [
        {
          id: 8409,
          awardType: 1,
          inscription: { roster: { id: 24070 }, players: [] },
        },
        {
          id: 8410,
          awardType: 2,
          inscription: { roster: { id: 24801 } },
        },
      ],
      '6197': [
        {
          id: 9000,
          awardType: 200,
          name: 'Wooden Spoon',
          inscription: { roster: { id: 31 } },
        },
      ],
    };

    expect(service.parse(content)).toEqual([
      { id: 8409, awardType: 1, rosterId: 24070 },
      { id: 8410, awardType: 2, rosterId: 24801 },
      { id: 9000, awardType: 200, name: 'Wooden Spoon', rosterId: 31 },
    ]);
  });

  it('parses an unknown awardType as-is', () => {
    const content = {
      '1': [{ id: 1, awardType: 999, inscription: { roster: { id: 2 } } }],
    };

    expect(service.parse(content)).toEqual([
      { id: 1, awardType: 999, rosterId: 2 },
    ]);
  });

  it('returns an empty list for a file with no awards', () => {
    expect(service.parse({})).toEqual([]);
    expect(service.parse({ '6196': [] })).toEqual([]);
  });

  it('throws naming the failing field on a shape mismatch', () => {
    const content = { '6196': [{ id: 1, awardType: 1, inscription: {} }] };

    expect(() => service.parse(content)).toThrow(
      /Invalid TP awards JSON:.*roster/,
    );
  });

  it('throws when the body is not an object of award arrays', () => {
    expect(() => service.parse([])).toThrow(/Invalid TP awards JSON/);
    expect(() => service.parse(null)).toThrow(/Invalid TP awards JSON/);
  });
});
