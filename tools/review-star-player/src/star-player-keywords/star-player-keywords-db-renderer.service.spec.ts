import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';
import { StarPlayerKeywordsDbRendererService } from './star-player-keywords-db-renderer.service';

const star: SampledStarPlayer = {
  positionId: 42,
  positionName: 'Grombrindal',
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
  service: StarPlayerKeywordsDbRendererService;
  query: MockProxy<StarPlayerPositionsQueryService>;
}> {
  const query = mock<StarPlayerPositionsQueryService>();
  query.rulesSetsFor.mockResolvedValue([{ ...rulesSet }]);
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerKeywordsDbRendererService,
      { provide: DB, useValue: dbResult.db },
      { provide: StarPlayerPositionsQueryService, useValue: query },
      HtmlService,
    ],
  }).compile();
  return {
    service: moduleRef.get(StarPlayerKeywordsDbRendererService),
    query,
  };
}

describe('StarPlayerKeywordsDbRendererService', () => {
  it('renders the imported keywords per rules set', async () => {
    const { service } = await makeService(
      mockDb(
        [{ id: 500, positionId: 42, rulesSetId: 100 }],
        [
          { positionRulesSetId: 500, keywordName: 'Star' },
          { positionRulesSetId: 500, keywordName: 'Undead' },
        ],
      ),
    );

    expect(await service.render(star)).toContain(
      '<td>BB2025</td><td>Star, Undead</td>',
    );
  });

  it('shows "none" for a rules set with no keywords recorded', async () => {
    const { service } = await makeService(
      mockDb([{ id: 500, positionId: 42, rulesSetId: 100 }], []),
    );

    expect(await service.render(star)).toContain(
      '<td>BB2025</td><td>none</td>',
    );
  });

  it('highlights a star with no characteristics row under a rules set', async () => {
    const { service } = await makeService(mockDb([], []));

    const html = await service.render(star);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain(
      '<td>BB2025</td><td class="mismatch-cell">missing (no characteristics row)</td>',
    );
  });

  it('renders a note when the star has no era mapped to a rules set', async () => {
    const { service, query } = await makeService(mockDb([], []));
    query.rulesSetsFor.mockResolvedValue([]);

    expect(await service.render(star)).toBe(
      '<p class="note">Star player &quot;Grombrindal&quot; has no era mapped to a rules set.</p>',
    );
  });
});
