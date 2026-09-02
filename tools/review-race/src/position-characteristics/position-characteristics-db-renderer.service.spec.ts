import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { CharacteristicFormatService } from './characteristic-format.service';
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
        isStarPlayer: false,
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
        isStarPlayer: false,
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
        isStarPlayer: false,
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
      '<td>Blitzer</td><td>missing</td><td>missing</td><td>missing</td><td>missing</td><td>missing</td>',
    );
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
        isStarPlayer: false,
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
});
