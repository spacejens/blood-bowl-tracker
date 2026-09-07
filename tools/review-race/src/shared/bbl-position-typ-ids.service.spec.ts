import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { BblPositionTypIdsService } from './bbl-position-typ-ids.service';
import { PositionExternalIdsService } from './position-external-ids.service';
import { RacePositionsQueryService } from './race-positions-query.service';

describe('BblPositionTypIdsService', () => {
  let service: BblPositionTypIdsService;
  let query: ReturnType<typeof mock<RacePositionsQueryService>>;
  let positionIds: ReturnType<typeof mock<PositionExternalIdsService>>;

  beforeEach(async () => {
    query = mock<RacePositionsQueryService>();
    positionIds = mock<PositionExternalIdsService>();
    const config = mock<RaceReviewConfigService>();
    config.getExternalSystemName.mockImplementation((source) =>
      source === 'bbl' ? 'BBL' : 'TP',
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPositionTypIdsService,
        { provide: RacePositionsQueryService, useValue: query },
        { provide: PositionExternalIdsService, useValue: positionIds },
        { provide: RaceReviewConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(BblPositionTypIdsService);
  });

  it("maps a position's name to the typId half of its BBL external id", async () => {
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    positionIds.forPositions.mockResolvedValue(
      new Map([[1, [{ systemName: 'BBL', externalId: '310-44' }]]]),
    );

    const typIds = await service.forRace(7);

    expect(typIds).toEqual(new Map([['Blitzer', '310']]));
  });

  it('skips a position with no BBL external id', async () => {
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    positionIds.forPositions.mockResolvedValue(
      new Map([[1, [{ systemName: 'TP', externalId: '999' }]]]),
    );

    const typIds = await service.forRace(7);

    expect(typIds.size).toBe(0);
  });

  it('skips a BBL external id with no hyphen rather than producing a bogus typId', async () => {
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    positionIds.forPositions.mockResolvedValue(
      new Map([[1, [{ systemName: 'BBL', externalId: '310' }]]]),
    );

    const typIds = await service.forRace(7);

    expect(typIds.size).toBe(0);
  });

  it('returns an empty map when the race has no positions', async () => {
    query.positionsFor.mockResolvedValue([]);

    const typIds = await service.forRace(7);

    expect(typIds.size).toBe(0);
  });
});
