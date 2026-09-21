import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import {
  CharacteristicFormatService,
  HtmlService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { PositionCharacteristicsDbRendererService } from './position-characteristics-db-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

async function makeService(dbResult: MockDbResult): Promise<{
  service: PositionCharacteristicsDbRendererService;
  query: ReturnType<typeof mock<RacePositionsQueryService>>;
}> {
  const query = mock<RacePositionsQueryService>();
  query.rulesSetEraIds.mockResolvedValue(new Map([[100, new Set([10])]]));
  query.positionEraIds.mockReturnValue(new Map([[1, new Set([10])]]));
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionCharacteristicsDbRendererService,
      { provide: DB, useValue: dbResult.db },
      { provide: RacePositionsQueryService, useValue: query },
      CharacteristicFormatService,
      HtmlService,
    ],
  }).compile();
  return {
    service: moduleRef.get(PositionCharacteristicsDbRendererService),
    query,
  };
}

describe('PositionCharacteristicsDbRendererService', () => {
  it('renders one sub-table per rules set, headed by its name', async () => {
    const { service, query } = await makeService(mockDb([]));
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    query.rulesSetsFor.mockResolvedValue([
      {
        rulesSetId: 100,
        rulesSetName: 'BB2020',
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus',
        armourFormat: 'plus',
      },
    ]);

    const html = await service.render(race);

    expect(html).toContain('<h5>BB2020</h5>');
  });

  it('formats values per the rules set own format columns', async () => {
    const { service, query } = await makeService(
      mockDb([
        {
          positionId: 1,
          rulesSetId: 100,
          move: 6,
          strength: 3,
          agility: 3,
          passing: null,
          armour: 8,
        },
      ]),
    );
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    query.rulesSetsFor.mockResolvedValue([
      {
        rulesSetId: 100,
        rulesSetName: 'BB2020',
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'absent',
        armourFormat: 'plus',
      },
    ]);

    const html = await service.render(race);

    expect(html).toContain(
      '<td>Blitzer</td><td>6</td><td>3</td><td>3+</td><td>—</td><td>8+</td>',
    );
  });

  it('highlights a position with no stored row for a rules set as missing', async () => {
    const { service, query } = await makeService(mockDb([]));
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    query.rulesSetsFor.mockResolvedValue([
      {
        rulesSetId: 100,
        rulesSetName: 'BB2020',
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus',
        armourFormat: 'plus',
      },
    ]);

    const html = await service.render(race);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain(
      '<td>Blitzer</td>' + '<td class="mismatch-cell">missing</td>'.repeat(5),
    );
    expect(html.match(/mismatch-cell/g)).toHaveLength(5);
  });

  it('renders a note when the race has no positions', async () => {
    const { service, query } = await makeService(mockDb([]));
    query.positionsFor.mockResolvedValue([]);

    const html = await service.render(race);

    expect(html).toBe(
      '<p class="note">No positions stored for race &quot;Dwarf&quot;, so no characteristics to show.</p>',
    );
  });

  it('renders a note when the race has no era mapped to a rules set', async () => {
    const { service, query } = await makeService(mockDb([]));
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);
    query.rulesSetsFor.mockResolvedValue([]);

    const html = await service.render(race);

    expect(html).toBe(
      '<p class="note">Race &quot;Dwarf&quot; has no era mapped to a rules set.</p>',
    );
  });

  it("excludes a position from a rules set's table when its own era does not map to that rules set", async () => {
    const { service, query } = await makeService(mockDb([]));
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        eraId: 10,
        eraName: 'Second Era',
      },
      {
        positionId: 2,
        positionName: 'Runner',
        eraId: 20,
        eraName: 'Third Era',
      },
    ]);
    query.positionEraIds.mockReturnValue(
      new Map([
        [1, new Set([10])],
        [2, new Set([20])],
      ]),
    );
    query.rulesSetEraIds.mockResolvedValue(
      new Map([
        [100, new Set([10])],
        [200, new Set([20])],
      ]),
    );
    query.rulesSetsFor.mockResolvedValue([
      {
        rulesSetId: 100,
        rulesSetName: 'BB2020',
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus',
        armourFormat: 'plus',
      },
      {
        rulesSetId: 200,
        rulesSetName: 'BB2025',
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus',
        armourFormat: 'plus',
      },
    ]);

    const html = await service.render(race);

    // Blitzer (era 10) is only reachable under BB2020, Runner (era 20) only
    // under BB2025 -- neither may appear in the other's table, not even as a
    // highlighted "missing" row.
    const bb2020Table = html.split('<h5>BB2025</h5>')[0];
    const bb2025Table = html.split('<h5>BB2025</h5>')[1];
    expect(bb2020Table).toContain('Blitzer');
    expect(bb2020Table).not.toContain('Runner');
    expect(bb2025Table).toContain('Runner');
    expect(bb2025Table).not.toContain('Blitzer');
  });
});
