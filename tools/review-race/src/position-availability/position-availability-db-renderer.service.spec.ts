import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { PositionAvailabilityDbRendererService } from './position-availability-db-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

async function makeService(): Promise<{
  service: PositionAvailabilityDbRendererService;
  query: ReturnType<typeof mock<RacePositionsQueryService>>;
}> {
  const query = mock<RacePositionsQueryService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionAvailabilityDbRendererService,
      { provide: RacePositionsQueryService, useValue: query },
      HtmlService,
    ],
  }).compile();
  return {
    service: moduleRef.get(PositionAvailabilityDbRendererService),
    query,
  };
}

describe('PositionAvailabilityDbRendererService', () => {
  it('renders one row per (era, position) with a yes/no star-player cell, grouped in query order', async () => {
    const { service, query } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blitzer',
        isStarPlayer: false,
        eraId: 10,
        eraName: 'Second Era',
      },
      {
        positionId: 2,
        positionName: 'Deathroller',
        isStarPlayer: true,
        eraId: 10,
        eraName: 'Second Era',
      },
      {
        positionId: 3,
        positionName: 'Blocker',
        isStarPlayer: false,
        eraId: 20,
        eraName: 'First Era',
      },
    ]);

    const html = await service.render(race);

    expect(query.positionsFor).toHaveBeenCalledWith(7);
    const rowIndex = (needle: string): number => html.indexOf(needle);
    expect(html).toContain(
      '<td>Second Era</td><td>Blitzer</td><td>no</td><td>1</td>',
    );
    expect(html).toContain(
      '<td>Second Era</td><td>Deathroller</td><td>yes</td><td>2</td>',
    );
    expect(html).toContain(
      '<td>First Era</td><td>Blocker</td><td>no</td><td>3</td>',
    );
    // Rows appear in the order the query returned them.
    expect(rowIndex('Blitzer')).toBeLessThan(rowIndex('Deathroller'));
    expect(rowIndex('Deathroller')).toBeLessThan(rowIndex('Blocker'));
  });

  it('renders a note when the race has no availability rows at all', async () => {
    const { service, query } = await makeService();
    query.positionsFor.mockResolvedValue([]);

    const html = await service.render(race);

    expect(html).toBe(
      '<p class="note">No positions_race_eras rows for race &quot;Dwarf&quot;.</p>',
    );
  });

  it('escapes a position name containing markup', async () => {
    const { service, query } = await makeService();
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: '<script>Blitzer</script>',
        isStarPlayer: false,
        eraId: 10,
        eraName: 'Second Era',
      },
    ]);

    const html = await service.render(race);

    expect(html).toContain('&lt;script&gt;Blitzer&lt;/script&gt;');
    expect(html).not.toContain('<script>Blitzer</script>');
  });
});
