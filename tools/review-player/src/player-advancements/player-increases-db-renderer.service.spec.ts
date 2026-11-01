import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import type { BblRawIncrease } from '../source/bbl-player-skills-cell.service';
import { PlayerIncreasesDbRendererService } from './player-increases-db-renderer.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 5,
  externalId: '1000',
  playerName: 'Grim',
  teamName: 'Dwarf Giants',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
  selectedFor: ['Random sample'],
};

function storedRow(
  characteristic: string | null,
  advancementOrder: number | null,
  orderConfirmed = false,
) {
  return { characteristic, advancementOrder, orderConfirmed };
}

function rawWith(increases: BblRawIncrease[]) {
  return {
    skills: [],
    increases,
    increaseCounts: {
      move: 0,
      strength: 0,
      agility: 0,
      passing: 0,
      armour: 0,
    },
  };
}

async function makeService(
  dbResult: MockDbResult,
  raw: ReturnType<typeof rawWith> | null = null,
): Promise<{
  service: PlayerIncreasesDbRendererService;
  bbl: MockProxy<BblPlayerAdvancementsReaderService>;
}> {
  const bbl = mock<BblPlayerAdvancementsReaderService>();
  bbl.read.mockResolvedValue(raw);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerIncreasesDbRendererService,
      { provide: DB, useValue: dbResult.db },
      { provide: BblPlayerAdvancementsReaderService, useValue: bbl },
      HtmlService,
    ],
  }).compile();
  return { service: moduleRef.get(PlayerIncreasesDbRendererService), bbl };
}

describe('PlayerIncreasesDbRendererService', () => {
  it("lists a TP player's rows with a note and no comparison", async () => {
    const { service, bbl } = await makeService(
      mockDb([storedRow('MA', 2, true), storedRow('ST', null)]),
    );

    const html = await service.render({ ...player, source: 'tp' });

    expect(html).toContain('<th>Increase</th><th>Order</th><th>Confirmed</th>');
    expect(html).toContain('<td>+MA</td><td>2</td><td>yes</td>');
    expect(html).toContain('<td>+ST</td><td>—</td><td>no</td>');
    expect(html).toContain('TP publishes no increase markers');
    expect(html).not.toContain('mismatch');
    expect(bbl.read).not.toHaveBeenCalled();
  });

  it('does not highlight stored increases that equal the raw markers', async () => {
    const { service } = await makeService(
      mockDb([storedRow('MA', 2), storedRow('AG', 3)]),
      rawWith([
        { characteristic: 'MA', advancementOrder: 2 },
        { characteristic: 'AG', advancementOrder: 3 },
      ]),
    );

    const html = await service.render(player);

    expect(html).toContain('<th>Raw source</th>');
    expect(html).not.toContain('class="mismatch"');
    expect(html).not.toContain('not in the raw source');
  });

  it('highlights a stored row of unknown order and appends the raw marker', async () => {
    const { service } = await makeService(
      mockDb([storedRow('MA', null)]),
      rawWith([{ characteristic: 'MA', advancementOrder: 2 }]),
    );

    const html = await service.render(player);

    expect(html).toContain('not in the raw source');
    expect(html).toContain('in the raw source only');
    expect(html.match(/class="mismatch"/g)).toHaveLength(2);
  });

  it('highlights the extra stored row when more are stored than the page shows', async () => {
    const { service } = await makeService(
      mockDb([storedRow('AG', 1), storedRow('AG', 1)]),
      rawWith([{ characteristic: 'AG', advancementOrder: 1 }]),
    );

    const html = await service.render(player);

    expect(html.match(/not in the raw source/g)).toHaveLength(1);
    expect(html).not.toContain('in the raw source only');
  });

  it('shows the stored rows without a comparison when the raw page is missing', async () => {
    const { service } = await makeService(mockDb([storedRow('MA', 1)]));

    const html = await service.render(player);

    expect(html).toContain('<td>+MA</td><td>1</td><td>no</td>');
    expect(html).not.toContain('Raw source');
  });

  it('ignores a stored row with no characteristic', async () => {
    const { service } = await makeService(mockDb([storedRow(null, 1)]));

    expect(await service.render({ ...player, source: 'tp' })).not.toContain(
      '<td>+',
    );
  });

  it('queries only live characteristic rows of the player', async () => {
    const dbResult = mockDb([]);
    const { service } = await makeService(dbResult);

    await service.render({ ...player, source: 'tp' });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const query = new PgDialect().sqlToQuery(where);
    expect(query.sql).toContain('"player_id" = $1');
    expect(query.sql).toContain('"source" = $2');
    expect(query.sql).toContain('"removed" = $3');
    expect(query.params).toEqual([5, 'characteristic', false]);
  });
});
