import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { SampledPlayer } from '../shared/review.types';
import { LastingInjuriesDbRendererService } from './lasting-injuries-db-renderer.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
  selectedFor: ['Random sample'],
};

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    missNextGame: false,
    nigglingInjuryCount: 0,
    moveReductionCount: 0,
    strengthReductionCount: 0,
    agilityReductionCount: 0,
    passingReductionCount: 0,
    armourReductionCount: 0,
    ...overrides,
  };
}

async function makeService(
  dbResult: MockDbResult,
): Promise<LastingInjuriesDbRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LastingInjuriesDbRendererService,
      { provide: DB, useValue: dbResult.db },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(LastingInjuriesDbRendererService);
}

describe('LastingInjuriesDbRendererService', () => {
  it('labels an uninjured row', async () => {
    const service = await makeService(mockDb([storedRow()]));

    const html = await service.render(player);

    expect(html).not.toContain('class="mismatch"');
    expect(html).toContain(
      '<td>Stored (no lasting injury)</td><td>false</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td>',
    );
  });

  it('labels a row with a niggling injury, without the mismatch highlight', async () => {
    const service = await makeService(
      mockDb([storedRow({ nigglingInjuryCount: 2 })]),
    );

    const html = await service.render(player);

    expect(html).not.toContain('class="mismatch"');
    expect(html).toContain('<td>Stored (injured)</td>');
  });

  it('treats a miss-next-game-only row as injured, without the mismatch highlight', async () => {
    const service = await makeService(
      mockDb([storedRow({ missNextGame: true })]),
    );

    const html = await service.render(player);

    expect(html).not.toContain('class="mismatch"');
    expect(html).toContain('<td>Stored (injured)</td><td>true</td>');
  });

  it('labels a row with a characteristic reduction, without the mismatch highlight', async () => {
    const service = await makeService(
      mockDb([storedRow({ armourReductionCount: 1 })]),
    );

    const html = await service.render(player);

    expect(html).not.toContain('class="mismatch"');
    expect(html).toContain('<td>Stored (injured)</td>');
  });

  it('notes a player with no row in the database', async () => {
    const service = await makeService(mockDb([]));

    const html = await service.render(player);

    expect(html).toBe(
      '<p class="note">No player row with id 42 in the database.</p>',
    );
  });

  it('filters the query on players.id', async () => {
    const dbResult = mockDb([storedRow()]);
    const service = await makeService(dbResult);

    await service.render(player);

    expect(dbResult.chains[0].where).toHaveBeenCalled();
  });
});
