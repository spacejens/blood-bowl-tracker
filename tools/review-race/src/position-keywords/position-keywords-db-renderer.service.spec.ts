import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { PositionKeywordsDbRendererService } from './position-keywords-db-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

const rulesSet = {
  rulesSetId: 100,
  rulesSetName: 'BB2025',
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
} as const;

async function makeService(dbResult: MockDbResult): Promise<{
  service: PositionKeywordsDbRendererService;
  query: MockProxy<RacePositionsQueryService>;
}> {
  const query = mock<RacePositionsQueryService>();
  query.positionsFor.mockResolvedValue([
    {
      positionId: 1,
      positionName: 'Zombie',
      eraId: 10,
      eraName: 'Third Era',
    },
  ]);
  query.rulesSetsFor.mockResolvedValue([{ ...rulesSet }]);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionKeywordsDbRendererService,
      { provide: DB, useValue: dbResult.db },
      { provide: RacePositionsQueryService, useValue: query },
      HtmlService,
    ],
  }).compile();
  return {
    service: moduleRef.get(PositionKeywordsDbRendererService),
    query,
  };
}

describe('PositionKeywordsDbRendererService', () => {
  it('renders the imported keywords per rules set', async () => {
    const { service } = await makeService(
      mockDb(
        [{ id: 500, positionId: 1, rulesSetId: 100 }],
        [
          { positionRulesSetId: 500, keywordName: 'Human' },
          { positionRulesSetId: 500, keywordName: 'Undead' },
        ],
      ),
    );

    const html = await service.render(race);

    expect(html).toContain('<h5>BB2025</h5>');
    expect(html).toContain('<td>Zombie</td><td>Human, Undead</td>');
  });

  it('shows "none" for a position with no keywords recorded', async () => {
    const { service } = await makeService(
      mockDb([{ id: 500, positionId: 1, rulesSetId: 100 }], []),
    );

    expect(await service.render(race)).toContain(
      '<td>Zombie</td><td>none</td>',
    );
  });

  it('highlights a position with no characteristics row at all', async () => {
    const { service } = await makeService(mockDb([], []));

    const html = await service.render(race);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain(
      '<td>Zombie</td><td class="mismatch-cell">missing (no characteristics row)</td>',
    );
  });

  it('renders a note when the race has no positions', async () => {
    const { service, query } = await makeService(mockDb([], []));
    query.positionsFor.mockResolvedValue([]);

    expect(await service.render(race)).toBe(
      '<p class="note">No positions stored for race &quot;Dwarf&quot;, so no keywords to show.</p>',
    );
  });

  it('renders a note when the race has no era mapped to a rules set', async () => {
    const { service, query } = await makeService(mockDb([], []));
    query.rulesSetsFor.mockResolvedValue([]);

    expect(await service.render(race)).toBe(
      '<p class="note">Race &quot;Dwarf&quot; has no era mapped to a rules set.</p>',
    );
  });
});
