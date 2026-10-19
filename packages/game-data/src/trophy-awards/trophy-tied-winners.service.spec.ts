import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TrophyTiedWinnersService } from './trophy-tied-winners.service';

describe('TrophyTiedWinnersService', () => {
  let service: TrophyTiedWinnersService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TrophyTiedWinnersService],
    }).compile();
    service = moduleRef.get(TrophyTiedWinnersService);
  });

  it('awards nobody when there are no candidates', () => {
    expect(service.select([], 4)).toEqual([]);
  });

  it('awards nobody when the top count is zero', () => {
    expect(
      service.select([{ playerId: 1, teamEraId: 10, eventCount: 0 }], 4),
    ).toEqual([]);
  });

  it('returns the single top candidate', () => {
    expect(
      service.select(
        [
          { playerId: 7, teamEraId: 70, eventCount: 9 },
          { playerId: 8, teamEraId: 80, eventCount: 4 },
        ],
        4,
      ),
    ).toEqual([{ playerId: 7, teamEraId: 70 }]);
  });

  it('returns every player of a tie within the cutoff', () => {
    expect(
      service.select(
        [
          { playerId: 1, teamEraId: 10, eventCount: 5 },
          { playerId: 2, teamEraId: 20, eventCount: 5 },
        ],
        4,
      ),
    ).toEqual([
      { playerId: 1, teamEraId: 10 },
      { playerId: 2, teamEraId: 20 },
    ]);
  });

  it('returns every player of a tie exactly at the cutoff', () => {
    expect(
      service.select(
        [
          { playerId: 1, teamEraId: 10, eventCount: 5 },
          { playerId: 2, teamEraId: 20, eventCount: 5 },
        ],
        2,
      ),
    ).toEqual([
      { playerId: 1, teamEraId: 10 },
      { playerId: 2, teamEraId: 20 },
    ]);
  });

  it('awards nobody when one more player ties than the cutoff allows', () => {
    expect(
      service.select(
        [
          { playerId: 1, teamEraId: 10, eventCount: 5 },
          { playerId: 2, teamEraId: 20, eventCount: 5 },
          { playerId: 3, teamEraId: 30, eventCount: 5 },
        ],
        2,
      ),
    ).toEqual([]);
  });

  it('excludes candidates below the top count', () => {
    expect(
      service.select(
        [
          { playerId: 1, teamEraId: 10, eventCount: 5 },
          { playerId: 2, teamEraId: 20, eventCount: 5 },
          { playerId: 3, teamEraId: 30, eventCount: 1 },
        ],
        2,
      ),
    ).toEqual([
      { playerId: 1, teamEraId: 10 },
      { playerId: 2, teamEraId: 20 },
    ]);
  });
});
