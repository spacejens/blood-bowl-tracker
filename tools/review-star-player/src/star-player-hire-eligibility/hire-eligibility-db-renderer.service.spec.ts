import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';
import { HireEligibilityDbRendererService } from './hire-eligibility-db-renderer.service';

const STAR = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

async function makeService(
  query: MockProxy<StarPlayerPositionsQueryService>,
): Promise<HireEligibilityDbRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HireEligibilityDbRendererService,
      { provide: StarPlayerPositionsQueryService, useValue: query },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(HireEligibilityDbRendererService);
}

describe('HireEligibilityDbRendererService', () => {
  it('renders one row per stored (race, era) pair', async () => {
    const query = mock<StarPlayerPositionsQueryService>();
    query.hireEligibilityFor.mockResolvedValue([
      {
        raceId: 4,
        raceName: 'Wood Elf',
        eraId: 1,
        eraName: 'BB2020 era',
        startDate: '2020-11-28',
        endDate: null,
      },
    ]);
    const service = await makeService(query);

    const html = await service.render(STAR);

    expect(html).toContain('Wood Elf');
    expect(html).toContain('BB2020 era');
    expect(html).toContain('ongoing');
  });

  it('summarises how many distinct races may hire the star', async () => {
    const query = mock<StarPlayerPositionsQueryService>();
    query.hireEligibilityFor.mockResolvedValue([
      {
        raceId: 4,
        raceName: 'Wood Elf',
        eraId: 1,
        eraName: 'A',
        startDate: '2020-11-28',
        endDate: null,
      },
      {
        raceId: 4,
        raceName: 'Wood Elf',
        eraId: 2,
        eraName: 'B',
        startDate: '2025-01-01',
        endDate: null,
      },
      {
        raceId: 7,
        raceName: 'High Elf',
        eraId: 1,
        eraName: 'A',
        startDate: '2020-11-28',
        endDate: null,
      },
    ]);
    const service = await makeService(query);

    expect(await service.render(STAR)).toContain('2 race(s)');
  });

  it('notes a star with no stored eligibility at all', async () => {
    const query = mock<StarPlayerPositionsQueryService>();
    query.hireEligibilityFor.mockResolvedValue([]);
    const service = await makeService(query);

    expect(await service.render(STAR)).toContain('No positions_race_eras rows');
  });
});
