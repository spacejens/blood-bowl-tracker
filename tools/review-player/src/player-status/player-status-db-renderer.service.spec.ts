import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import type { SQL } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect } from '@blood-bowl-tracker/db/test-helpers';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it, type Mock } from 'vitest';

import type { SampledPlayer } from '../shared/review.types';
import { PlayerStatusDbRendererService } from './player-status-db-renderer.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Third Era',
  selectedFor: ['Random sample'],
};

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    status: 'active',
    eraName: 'Third Era',
    eraEndDate: null,
    eraEnded: false,
    ...overrides,
  };
}

async function makeService(
  dbResult: MockDbResult,
): Promise<PlayerStatusDbRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerStatusDbRendererService,
      { provide: DB, useValue: dbResult.db },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(PlayerStatusDbRendererService);
}

describe('PlayerStatusDbRendererService', () => {
  it.each(['active', 'dead', 'retired', 'temporarily_retired'])(
    'shows a stored %s status as stored',
    async (status) => {
      const service = await makeService(mockDb([storedRow({ status })]));

      const html = await service.render(player);

      expect(html).toContain('<th>Stored status</th>');
      expect(html).toContain(`<td>${status}</td>`);
      expect(html).not.toContain('active until the end of the era');
    },
  );

  it('shows a NULL status as unknown, never as active', async () => {
    const service = await makeService(mockDb([storedRow({ status: null })]));

    const html = await service.render(player);

    expect(html).toContain('<td>unknown (no source reported a status)</td>');
    expect(html).not.toContain('<td>active</td>');
  });

  it('adds the era note for an active player whose era has ended', async () => {
    const service = await makeService(
      mockDb([storedRow({ eraEndDate: '2021-06-30', eraEnded: true })]),
    );

    const html = await service.render(player);

    expect(html).toContain('<td>active</td>');
    expect(html).toContain(
      '<p class="note">active until the end of the era: Third Era ended 2021-06-30.</p>',
    );
  });

  it('adds no era note for an active player in a running era with a future end date', async () => {
    const service = await makeService(
      mockDb([storedRow({ eraEndDate: '2999-01-01', eraEnded: false })]),
    );

    expect(await service.render(player)).not.toContain('active until');
  });

  it('adds no era note for an active player in an era with no end date', async () => {
    const service = await makeService(mockDb([storedRow()]));

    expect(await service.render(player)).not.toContain('active until');
  });

  it('adds no era note for a dead player in an ended era', async () => {
    const service = await makeService(
      mockDb([
        storedRow({ status: 'dead', eraEndDate: '2021-06-30', eraEnded: true }),
      ]),
    );

    expect(await service.render(player)).not.toContain('active until');
  });

  it('notes a player with no row in the database', async () => {
    const service = await makeService(mockDb([]));

    expect(await service.render(player)).toBe(
      '<p class="note">No player row with id 42 in the database.</p>',
    );
  });

  it("joins the player's era and filters on players.id", async () => {
    const dbResult = mockDb([storedRow()]);
    const service = await makeService(dbResult);

    await service.render(player);

    expect(dbResult.chains[0].innerJoin).toHaveBeenCalledTimes(2);
    expect(dbResult.chains[0].where).toHaveBeenCalled();
  });

  it('computes eraEnded as an end date that is set and already past', async () => {
    const dbResult = mockDb([storedRow()]);
    const service = await makeService(dbResult);

    await service.render(player);

    const select = dbResult.db.select as unknown as Mock;
    const fields = select.mock.calls[0][0] as { eraEnded: SQL };
    const query = new PgDialect().sqlToQuery(fields.eraEnded);
    expect(query.sql).toContain('"eras"."end_date" is not null');
    expect(query.sql).toContain('"eras"."end_date" < current_date');
  });
});
