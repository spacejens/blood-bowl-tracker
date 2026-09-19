import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';
import { StarPlayerSkillsDbRendererService } from './star-player-skills-db-renderer.service';

const star: SampledStarPlayer = {
  positionId: 42,
  positionName: 'Grombrindal',
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

describe('StarPlayerSkillsDbRendererService', () => {
  let service: StarPlayerSkillsDbRendererService;
  let query: MockProxy<StarPlayerPositionsQueryService>;

  beforeEach(async () => {
    query = mock<StarPlayerPositionsQueryService>();
    query.rulesSetsFor.mockResolvedValue([{ ...rulesSet }]);
    query.skillsFor.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerSkillsDbRendererService,
        { provide: StarPlayerPositionsQueryService, useValue: query },
        HtmlService,
        SkillFormatService,
      ],
    }).compile();
    service = moduleRef.get(StarPlayerSkillsDbRendererService);
  });

  it('lists the stored skills for each rules set the star is hireable under', async () => {
    query.skillsFor.mockResolvedValue([
      {
        rulesSetId: 100,
        skillName: 'Block',
        attributeValue: null,
        category: 'general',
      },
      {
        rulesSetId: 100,
        skillName: 'Loner',
        attributeValue: '4+',
        category: 'extraordinary',
      },
    ]);

    expect(await service.render(star)).toContain(
      '<td>BB2020</td><td>Block, Loner (4+)</td>',
    );
  });

  it('marks the unique-category skill with the star marker', async () => {
    query.skillsFor.mockResolvedValue([
      {
        rulesSetId: 100,
        skillName: 'The White Dwarf',
        attributeValue: null,
        category: 'unique',
      },
    ]);

    expect(await service.render(star)).toContain('★ The White Dwarf');
  });

  it('highlights a rules set with no stored skills at all', async () => {
    const html = await service.render(star);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain(
      '<td>BB2020</td><td class="mismatch-cell">missing</td>',
    );
  });

  it('lists a stored skill whose rules set no era implies as an orphan row', async () => {
    query.skillsFor.mockResolvedValue([
      {
        rulesSetId: 999,
        skillName: 'Block',
        attributeValue: null,
        category: 'general',
      },
    ]);

    const html = await service.render(star);

    expect(html).toContain('rules set id 999 (not implied by any era)');
  });

  it('renders a note when the star has no rules set and no stored skills', async () => {
    query.rulesSetsFor.mockResolvedValue([]);

    expect(await service.render(star)).toBe(
      '<p class="note">Star player &quot;Grombrindal&quot; has no era mapped to a rules set, and no stored starting skills.</p>',
    );
  });
});
