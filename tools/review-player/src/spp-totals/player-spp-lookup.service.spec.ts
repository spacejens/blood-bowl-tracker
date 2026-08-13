import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import type { SampledPlayer } from '../shared/review.types';
import { PlayerSppLookupService } from './player-spp-lookup.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Janhorgh',
  teamName: 'Bockar',
  positionName: 'Lineman',
  eraName: 'Third Era',
  selectedFor: ['Random sample'],
};

async function makeService(
  dbResult: MockDbResult,
): Promise<PlayerSppLookupService> {
  const moduleRef = await Test.createTestingModule({
    providers: [PlayerSppLookupService, { provide: DB, useValue: dbResult.db }],
  }).compile();
  return moduleRef.get(PlayerSppLookupService);
}

describe('PlayerSppLookupService', () => {
  it('reports no mismatch when the two totals agree', async () => {
    const service = await makeService(
      mockDb(
        [{ computedTotal: '16', eventCount: 5 }],
        [{ sppTotal: 16, sppAdjustment: 0 }],
      ),
    );

    expect(await service.load(player)).toEqual({
      computedTotal: 16,
      eventCount: 5,
      sppTotal: 16,
      sppAdjustment: 0,
      mismatch: false,
    });
  });

  it('flags disagreeing totals', async () => {
    const service = await makeService(
      mockDb(
        [{ computedTotal: '16', eventCount: 5 }],
        [{ sppTotal: 20, sppAdjustment: 0 }],
      ),
    );

    expect(await service.load(player)).toMatchObject({ mismatch: true });
  });

  it('reports no mismatch when the stored total equals computed plus adjustment', async () => {
    const service = await makeService(
      mockDb(
        [{ computedTotal: '16', eventCount: 5 }],
        [{ sppTotal: 20, sppAdjustment: 4 }],
      ),
    );

    expect(await service.load(player)).toEqual({
      computedTotal: 16,
      eventCount: 5,
      sppTotal: 20,
      sppAdjustment: 4,
      mismatch: false,
    });
  });

  it('flags a stored total that differs from computed plus adjustment', async () => {
    const service = await makeService(
      mockDb(
        [{ computedTotal: '16', eventCount: 5 }],
        [{ sppTotal: 21, sppAdjustment: 4 }],
      ),
    );

    expect(await service.load(player)).toMatchObject({
      computedTotal: 16,
      sppTotal: 21,
      sppAdjustment: 4,
      mismatch: true,
    });
  });

  it('flags a player with no stored total at all', async () => {
    const service = await makeService(
      mockDb(
        [{ computedTotal: '16', eventCount: 5 }],
        [{ sppTotal: null, sppAdjustment: null }],
      ),
    );

    expect(await service.load(player)).toMatchObject({
      sppTotal: null,
      mismatch: true,
    });
  });

  it('treats a player with no SPP-earning events as a computed total of 0', async () => {
    const service = await makeService(
      mockDb(
        [{ computedTotal: null, eventCount: 0 }],
        [{ sppTotal: 0, sppAdjustment: 0 }],
      ),
    );

    expect(await service.load(player)).toMatchObject({
      computedTotal: 0,
      mismatch: false,
    });
  });

  it('treats a NULL stored adjustment as 0 when comparing against the stored total', async () => {
    const service = await makeService(
      mockDb(
        [{ computedTotal: '16', eventCount: 5 }],
        [{ sppTotal: 16, sppAdjustment: null }],
      ),
    );

    expect(await service.load(player)).toMatchObject({
      computedTotal: 16,
      sppTotal: 16,
      sppAdjustment: null,
      mismatch: false,
    });
  });

  it('reports a player missing from the players table as having nothing stored', async () => {
    const service = await makeService(
      mockDb([{ computedTotal: '3', eventCount: 1 }], []),
    );

    expect(await service.load(player)).toMatchObject({
      sppTotal: null,
      sppAdjustment: null,
      mismatch: true,
    });
  });
});
