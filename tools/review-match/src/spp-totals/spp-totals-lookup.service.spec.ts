import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import type { SampledMatch } from '../shared/review.types';
import { SppTotalsLookupService } from './spp-totals-lookup.service';

const match: SampledMatch = {
  source: 'bbl',
  matchId: 11,
  externalId: '1830',
  matchName: 'Round 3',
  competitionName: 'Season 18',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
  category: 'normal',
  selectedFor: ['Contains a foul'],
};

async function makeService(
  dbResult: MockDbResult,
): Promise<SppTotalsLookupService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SppTotalsLookupService, { provide: DB, useValue: dbResult.db }],
  }).compile();
  return moduleRef.get(SppTotalsLookupService);
}

describe('SppTotalsLookupService', () => {
  it('reports no mismatch when the computed total equals the stored total', async () => {
    const service = await makeService(
      mockDb(
        [{ playerId: 7, matchTotal: '3' }],
        [],
        [
          {
            playerId: 7,
            playerName: 'Betong Bengt',
            teamName: 'Bräkenäs Betongbockar',
            sppTotal: 16,
            sppAdjustment: 2,
          },
        ],
        [{ playerId: 7, computedTotal: '16' }],
      ),
    );

    const rows = await service.load(match);

    expect(rows).toEqual([
      {
        playerId: 7,
        playerName: 'Betong Bengt',
        teamName: 'Bräkenäs Betongbockar',
        matchTotal: 3,
        computedTotal: 16,
        sppTotal: 16,
        sppAdjustment: 2,
        mismatch: false,
      },
    ]);
  });

  it('flags a player whose computed total differs from the stored total', async () => {
    const service = await makeService(
      mockDb(
        [{ playerId: 7, matchTotal: '3' }],
        [],
        [
          {
            playerId: 7,
            playerName: 'Betong Bengt',
            teamName: 'Bockar',
            sppTotal: 20,
            sppAdjustment: 0,
          },
        ],
        [{ playerId: 7, computedTotal: '16' }],
      ),
    );

    const [row] = await service.load(match);

    expect(row).toMatchObject({
      computedTotal: 16,
      sppTotal: 20,
      mismatch: true,
    });
  });

  it('flags a player with events but no stored total at all', async () => {
    const service = await makeService(
      mockDb(
        [{ playerId: 7, matchTotal: '3' }],
        [],
        [
          {
            playerId: 7,
            playerName: 'Rookie',
            teamName: 'Bockar',
            sppTotal: null,
            sppAdjustment: null,
          },
        ],
        [{ playerId: 7, computedTotal: '3' }],
      ),
    );

    const [row] = await service.load(match);

    expect(row).toMatchObject({
      sppTotal: null,
      sppAdjustment: null,
      mismatch: true,
    });
  });

  it('includes a roster player with a stored total but no events in this match', async () => {
    const service = await makeService(
      mockDb(
        [],
        [{ playerId: 9 }],
        [
          {
            playerId: 9,
            playerName: 'Veteran',
            teamName: 'Bockar',
            sppTotal: 30,
            sppAdjustment: 0,
          },
        ],
        [{ playerId: 9, computedTotal: '30' }],
      ),
    );

    const rows = await service.load(match);

    expect(rows).toEqual([
      {
        playerId: 9,
        playerName: 'Veteran',
        teamName: 'Bockar',
        matchTotal: 0,
        computedTotal: 30,
        sppTotal: 30,
        sppAdjustment: 0,
        mismatch: false,
      },
    ]);
  });

  it('treats a player with no SPP-earning events as a computed total of 0', async () => {
    const service = await makeService(
      mockDb(
        [{ playerId: 7, matchTotal: null }],
        [],
        [
          {
            playerId: 7,
            playerName: 'Bench Warmer',
            teamName: 'Bockar',
            sppTotal: 0,
            sppAdjustment: 0,
          },
        ],
        [],
      ),
    );

    const [row] = await service.load(match);

    expect(row).toMatchObject({
      matchTotal: 0,
      computedTotal: 0,
      mismatch: false,
    });
  });

  it('sorts rows by player name, then by id', async () => {
    const service = await makeService(
      mockDb(
        [
          { playerId: 7, matchTotal: '1' },
          { playerId: 9, matchTotal: '2' },
        ],
        [],
        [
          {
            playerId: 9,
            playerName: 'Alpha',
            teamName: 'Bockar',
            sppTotal: 2,
            sppAdjustment: 0,
          },
          {
            playerId: 7,
            playerName: 'Zulu',
            teamName: 'Bockar',
            sppTotal: 1,
            sppAdjustment: 0,
          },
        ],
        [
          { playerId: 7, computedTotal: '1' },
          { playerId: 9, computedTotal: '2' },
        ],
      ),
    );

    const rows = await service.load(match);

    expect(rows.map((row) => row.playerName)).toEqual(['Alpha', 'Zulu']);
  });

  it('issues no further queries when the match has no players in scope', async () => {
    const dbResult = mockDb([], []);
    const service = await makeService(dbResult);

    const rows = await service.load(match);

    expect(rows).toEqual([]);
    expect(dbResult.chains).toHaveLength(2);
  });
});
