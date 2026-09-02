import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { RaceIdentityDbRendererService } from './race-identity-db-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

async function makeService(): Promise<{
  service: RaceIdentityDbRendererService;
  externalIds: ReturnType<typeof mock<RaceExternalIdsService>>;
  query: ReturnType<typeof mock<RacePositionsQueryService>>;
}> {
  const externalIds = mock<RaceExternalIdsService>();
  const query = mock<RacePositionsQueryService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaceIdentityDbRendererService,
      { provide: RaceExternalIdsService, useValue: externalIds },
      { provide: RacePositionsQueryService, useValue: query },
      HtmlService,
    ],
  }).compile();
  return {
    service: moduleRef.get(RaceIdentityDbRendererService),
    externalIds,
    query,
  };
}

describe('RaceIdentityDbRendererService', () => {
  it('renders the database id and name rows', async () => {
    const { service, externalIds, query } = await makeService();
    query.erasFor.mockResolvedValue([]);
    externalIds.allForRace.mockResolvedValue([]);

    const html = await service.render(race);

    expect(html).toContain('<td>Database id</td><td>7</td>');
    expect(html).toContain('<td>Name</td><td>Dwarf</td>');
  });

  it('renders one Era row per era, with its date range', async () => {
    const { service, externalIds, query } = await makeService();
    query.erasFor.mockResolvedValue([
      {
        eraId: 1,
        eraName: 'Third Era',
        startDate: '2010-01-01',
        endDate: null,
      },
      {
        eraId: 2,
        eraName: 'Second Era',
        startDate: '2000-01-01',
        endDate: '2009-12-31',
      },
    ]);
    externalIds.allForRace.mockResolvedValue([]);

    const html = await service.render(race);

    expect(html).toContain(
      '<td>Era</td><td>Third Era (2010-01-01 – ongoing)</td>',
    );
    expect(html).toContain(
      '<td>Era</td><td>Second Era (2000-01-01 – 2009-12-31)</td>',
    );
  });

  it('renders Era as none when the race has no eras', async () => {
    const { service, externalIds, query } = await makeService();
    query.erasFor.mockResolvedValue([]);
    externalIds.allForRace.mockResolvedValue([]);

    const html = await service.render(race);

    expect(html).toContain('<td>Era</td><td>none</td>');
  });

  it('renders one External id row per external id', async () => {
    const { service, externalIds, query } = await makeService();
    query.erasFor.mockResolvedValue([]);
    externalIds.allForRace.mockResolvedValue([
      { systemName: 'BBL', externalId: '5' },
      { systemName: 'TP', externalId: 'dwarf' },
    ]);

    const html = await service.render(race);

    expect(html).toContain('<td>External id (BBL)</td><td>5</td>');
    expect(html).toContain('<td>External id (TP)</td><td>dwarf</td>');
  });

  it('renders External id as none when the race carries none', async () => {
    const { service, externalIds, query } = await makeService();
    query.erasFor.mockResolvedValue([]);
    externalIds.allForRace.mockResolvedValue([]);

    const html = await service.render(race);

    expect(html).toContain('<td>External id</td><td>none</td>');
  });

  it('escapes a name containing < and &', async () => {
    const { service, externalIds, query } = await makeService();
    query.erasFor.mockResolvedValue([]);
    externalIds.allForRace.mockResolvedValue([]);

    const html = await service.render({
      ...race,
      raceName: 'Dwarf <Team> & Co',
    });

    expect(html).toContain('<td>Name</td><td>Dwarf &lt;Team&gt; &amp; Co</td>');
  });
});
