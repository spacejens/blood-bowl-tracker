import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { PositionStartingSkillsDbRendererService } from './position-starting-skills-db-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

const rulesSet = {
  rulesSetId: 100,
  rulesSetName: 'BB2020',
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
} as const;

async function makeService(dbResult: MockDbResult): Promise<{
  service: PositionStartingSkillsDbRendererService;
  query: MockProxy<RacePositionsQueryService>;
}> {
  const query = mock<RacePositionsQueryService>();
  query.positionsFor.mockResolvedValue([
    {
      positionId: 1,
      positionName: 'Blitzer',
      eraId: 10,
      eraName: 'Second Era',
    },
  ]);
  query.rulesSetsFor.mockResolvedValue([{ ...rulesSet }]);
  query.rulesSetEraIds.mockResolvedValue(new Map([[100, new Set([10])]]));
  query.positionEraIds.mockReturnValue(new Map([[1, new Set([10])]]));
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionStartingSkillsDbRendererService,
      { provide: DB, useValue: dbResult.db },
      { provide: RacePositionsQueryService, useValue: query },
      HtmlService,
      SkillFormatService,
    ],
  }).compile();
  return {
    service: moduleRef.get(PositionStartingSkillsDbRendererService),
    query,
  };
}

describe('PositionStartingSkillsDbRendererService', () => {
  it('renders one sub-table per rules set, headed by its name', async () => {
    const { service } = await makeService(
      mockDb([{ id: 500, positionId: 1, rulesSetId: 100 }], []),
    );

    expect(await service.render(race)).toContain('<h5>BB2020</h5>');
  });

  it("lists a position's stored starting skills, with attribute values", async () => {
    const { service } = await makeService(
      mockDb(
        [{ id: 500, positionId: 1, rulesSetId: 100 }],
        [
          {
            positionRulesSetId: 500,
            skillName: 'Block',
            attributeValue: null,
            category: 'general',
          },
          {
            positionRulesSetId: 500,
            skillName: 'Loner',
            attributeValue: '4+',
            category: 'extraordinary',
          },
        ],
      ),
    );

    expect(await service.render(race)).toContain(
      '<td>Blitzer</td><td>Block, Loner (4+)</td>',
    );
  });

  it('marks a unique-category skill with the star marker', async () => {
    const { service } = await makeService(
      mockDb(
        [{ id: 500, positionId: 1, rulesSetId: 100 }],
        [
          {
            positionRulesSetId: 500,
            skillName: 'Catch of the Day',
            attributeValue: null,
            category: 'unique',
          },
        ],
      ),
    );

    expect(await service.render(race)).toContain('★ Catch of the Day');
  });

  it('shows a position with a stored row but no skills as having none', async () => {
    const { service } = await makeService(
      mockDb([{ id: 500, positionId: 1, rulesSetId: 100 }], []),
    );

    expect(await service.render(race)).toContain(
      '<td>Blitzer</td><td>none</td>',
    );
  });

  it('highlights a position with no stored row for the rules set as missing', async () => {
    const { service } = await makeService(mockDb([], []));

    const html = await service.render(race);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain(
      '<td>Blitzer</td><td class="mismatch-cell">missing (no characteristics row)</td>',
    );
  });

  it('renders a note when the race has no positions', async () => {
    const { service, query } = await makeService(mockDb([], []));
    query.positionsFor.mockResolvedValue([]);

    expect(await service.render(race)).toBe(
      '<p class="note">No positions stored for race &quot;Dwarf&quot;, so no starting skills to show.</p>',
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
    const { service, query } = await makeService(mockDb([], []));
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
      { ...rulesSet, rulesSetId: 100, rulesSetName: 'BB2020' },
      { ...rulesSet, rulesSetId: 200, rulesSetName: 'BB2025' },
    ]);

    const html = await service.render(race);

    // Blitzer (era 10) is only reachable under BB2020, Runner (era 20) only
    // under BB2025 -- neither may appear in the other's table, not even as a
    // highlighted "missing (no characteristics row)" row.
    const bb2020Table = html.split('<h5>BB2025</h5>')[0];
    const bb2025Table = html.split('<h5>BB2025</h5>')[1];
    expect(bb2020Table).toContain('Blitzer');
    expect(bb2020Table).not.toContain('Runner');
    expect(bb2025Table).toContain('Runner');
    expect(bb2025Table).not.toContain('Blitzer');
  });
});
