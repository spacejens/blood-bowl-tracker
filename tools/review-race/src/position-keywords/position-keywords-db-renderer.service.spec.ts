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
        [{ eraId: 10, rulesSetId: 100 }],
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
      mockDb(
        [{ eraId: 10, rulesSetId: 100 }],
        [{ id: 500, positionId: 1, rulesSetId: 100 }],
        [],
      ),
    );

    expect(await service.render(race)).toContain(
      '<td>Zombie</td><td>none</td>',
    );
  });

  it('highlights a position with no characteristics row at all', async () => {
    const { service } = await makeService(
      mockDb([{ eraId: 10, rulesSetId: 100 }], [], []),
    );

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

  it("excludes a position from a rules set's table when its own era does not map to that rules set", async () => {
    const { service, query } = await makeService(
      mockDb(
        // eraRulesSetPairs: era 10 -> rulesSet 100, era 20 -> rulesSet 200
        [
          { eraId: 10, rulesSetId: 100 },
          { eraId: 20, rulesSetId: 200 },
        ],
        // rowIds
        [
          { id: 500, positionId: 1, rulesSetId: 100 },
          { id: 501, positionId: 2, rulesSetId: 200 },
        ],
        // stored keywords
        [],
      ),
    );
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Zombie',
        eraId: 10,
        eraName: 'Third Era',
      },
      {
        positionId: 2,
        positionName: 'Skeleton',
        eraId: 20,
        eraName: 'Fourth Era',
      },
    ]);
    query.rulesSetsFor.mockResolvedValue([
      { ...rulesSet, rulesSetId: 100, rulesSetName: 'BB2020' },
      { ...rulesSet, rulesSetId: 200, rulesSetName: 'BB2025' },
    ]);

    const html = await service.render(race);

    // Zombie (era 10) belongs only under BB2020's table; Skeleton (era 20)
    // belongs only under BB2025's -- neither should cross into the other's.
    const bb2020Table = html.split('<h5>BB2025</h5>')[0];
    const bb2025Table = html.split('<h5>BB2025</h5>')[1];
    expect(bb2020Table).toContain('Zombie');
    expect(bb2020Table).not.toContain('Skeleton');
    expect(bb2025Table).toContain('Skeleton');
    expect(bb2025Table).not.toContain('Zombie');
  });
});
