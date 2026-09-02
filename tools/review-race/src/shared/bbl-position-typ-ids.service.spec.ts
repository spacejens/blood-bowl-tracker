import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { BblPositionTypIdsService } from './bbl-position-typ-ids.service';
import { PositionExternalIdsService } from './position-external-ids.service';
import { RacePositionsQueryService } from './race-positions-query.service';

async function makeService(): Promise<{
  service: BblPositionTypIdsService;
  query: ReturnType<typeof mock<RacePositionsQueryService>>;
  positionIds: ReturnType<typeof mock<PositionExternalIdsService>>;
}> {
  const query = mock<RacePositionsQueryService>();
  const positionIds = mock<PositionExternalIdsService>();
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
  return {
    service: moduleRef.get(BblPositionTypIdsService),
    query,
    positionIds,
  };
}

describe('BblPositionTypIdsService', () => {
  it("maps a position's name to the typId half of its BBL external id", async () => {
    const { service, query, positionIds } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        isStarPlayer: false,
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
    const { service, query, positionIds } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        isStarPlayer: false,
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
    const { service, query, positionIds } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        isStarPlayer: false,
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
    const { service, query } = await makeService();
    query.positionsFor.mockResolvedValue([]);

    const typIds = await service.forRace(7);

    expect(typIds.size).toBe(0);
  });
});
