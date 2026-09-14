import {
  CharacteristicFormatService,
  HtmlService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';
import { StarPlayerCharacteristicsDbRendererService } from './characteristics-db-renderer.service';

const STAR = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

const BB2020 = {
  rulesSetId: 2,
  rulesSetName: 'BB2020',
  moveFormat: 'bare' as const,
  strengthFormat: 'bare' as const,
  agilityFormat: 'plus' as const,
  passingFormat: 'plus_zero_legal' as const,
  armourFormat: 'plus' as const,
};

const CRP = {
  rulesSetId: 1,
  rulesSetName: 'CRP',
  moveFormat: 'bare' as const,
  strengthFormat: 'bare' as const,
  agilityFormat: 'bare' as const,
  passingFormat: 'absent' as const,
  armourFormat: 'bare' as const,
};

async function makeService(
  query: MockProxy<StarPlayerPositionsQueryService>,
): Promise<StarPlayerCharacteristicsDbRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerCharacteristicsDbRendererService,
      { provide: StarPlayerPositionsQueryService, useValue: query },
      CharacteristicFormatService,
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(StarPlayerCharacteristicsDbRendererService);
}

describe('StarPlayerCharacteristicsDbRendererService', () => {
  it("renders one row per rules set in that rules set's own formats", async () => {
    const query = mock<StarPlayerPositionsQueryService>();
    query.rulesSetsFor.mockResolvedValue([BB2020]);
    query.characteristicsFor.mockResolvedValue([
      {
        rulesSetId: 2,
        move: 8,
        strength: 3,
        agility: 2,
        passing: 5,
        armour: 8,
      },
    ]);
    const service = await makeService(query);

    const html = await service.render(STAR);

    expect(html).toContain('BB2020');
    expect(html).toContain('2+');
    expect(html).toContain('5+');
    expect(html).toContain('8+');
  });

  it('renders an absent passing format as a dash', async () => {
    const query = mock<StarPlayerPositionsQueryService>();
    query.rulesSetsFor.mockResolvedValue([CRP]);
    query.characteristicsFor.mockResolvedValue([
      {
        rulesSetId: 1,
        move: 8,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 8,
      },
    ]);
    const service = await makeService(query);

    expect(await service.render(STAR)).toContain('—');
  });

  it('highlights a rules set the star has no stored row for', async () => {
    const query = mock<StarPlayerPositionsQueryService>();
    query.rulesSetsFor.mockResolvedValue([BB2020]);
    query.characteristicsFor.mockResolvedValue([]);
    const service = await makeService(query);

    const html = await service.render(STAR);

    expect(html).toContain('missing');
    expect(html).toContain('class="mismatch"');
  });

  it('notes a star that is hireable under no rules set at all', async () => {
    const query = mock<StarPlayerPositionsQueryService>();
    query.rulesSetsFor.mockResolvedValue([]);
    query.characteristicsFor.mockResolvedValue([]);
    const service = await makeService(query);

    expect(await service.render(STAR)).toContain(
      'no era mapped to a rules set',
    );
  });

  it('notes the missing era mapping while still listing an orphan characteristic row', async () => {
    const query = mock<StarPlayerPositionsQueryService>();
    query.rulesSetsFor.mockResolvedValue([]);
    query.characteristicsFor.mockResolvedValue([
      {
        rulesSetId: 9,
        move: 7,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 8,
      },
    ]);
    const service = await makeService(query);

    const html = await service.render(STAR);

    expect(html).toContain('has no era mapped to a rules set');
    expect(html).toContain('rules set id 9');
  });

  it('lists a stored row whose rules set no era maps to as an extra row', async () => {
    const query = mock<StarPlayerPositionsQueryService>();
    query.rulesSetsFor.mockResolvedValue([BB2020]);
    query.characteristicsFor.mockResolvedValue([
      {
        rulesSetId: 2,
        move: 8,
        strength: 3,
        agility: 2,
        passing: 5,
        armour: 8,
      },
      {
        rulesSetId: 9,
        move: 7,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 8,
      },
    ]);
    const service = await makeService(query);

    expect(await service.render(STAR)).toContain('rules set id 9');
  });
});
