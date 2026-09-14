import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { HireEligibilityRawRendererService } from './hire-eligibility-raw-renderer.service';

const STAR = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

interface Deps {
  query: MockProxy<StarPlayerPositionsQueryService>;
  externalIds: MockProxy<StarPlayerExternalIdsService>;
  lookup: MockProxy<StarSourceLookupService>;
  manual: MockProxy<ManualRawDataService>;
}

function deps(): Deps {
  const query = mock<StarPlayerPositionsQueryService>();
  query.hireEligibilityFor.mockResolvedValue([]);
  const externalIds = mock<StarPlayerExternalIdsService>();
  externalIds.allForPosition.mockResolvedValue([]);
  const lookup = mock<StarSourceLookupService>();
  lookup.bblStarFor.mockResolvedValue({
    star: null,
    notFoundNote:
      'no BBL page found for "Eldril Sidewinder" (no BBL typID recorded)',
  });
  lookup.tpStarsFor.mockResolvedValue({
    stars: [],
    notFoundNote: 'no TP entry found for spelling(s) Eldril Sidewinder',
  });
  const manual = mock<ManualRawDataService>();
  manual.availability.mockResolvedValue([]);
  return { query, externalIds, lookup, manual };
}

async function makeService(
  overrides: Deps,
): Promise<HireEligibilityRawRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HireEligibilityRawRendererService,
      { provide: StarPlayerPositionsQueryService, useValue: overrides.query },
      {
        provide: StarPlayerExternalIdsService,
        useValue: overrides.externalIds,
      },
      { provide: StarSourceLookupService, useValue: overrides.lookup },
      { provide: ManualRawDataService, useValue: overrides.manual },
      StarPlayerNameMatcherService,
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(HireEligibilityRawRendererService);
}

describe('HireEligibilityRawRendererService', () => {
  it('highlights BBL and TP as not found when neither source carries the star', async () => {
    const service = await makeService(deps());

    const html = await service.render(STAR);

    expect(html).toContain('no BBL page found for');
    expect(html).toContain('no TP entry found for spelling(s)');
    expect(html).toContain('class="mismatch"');
  });

  it("renders BBL's Can play for text verbatim", async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Eldril Sidewinder',
        cost: null,
        canPlayFor: 'Any team with Elven Kingdoms League',
        skills: null,
        characteristics: null,
      },
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BBL');
    expect(html).toContain('Any team with Elven Kingdoms League');
  });

  it('renders — for a BBL page with canPlayFor: null', async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Eldril Sidewinder',
        cost: null,
        canPlayFor: null,
        skills: null,
        characteristics: null,
      },
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BBL');
    expect(html).toContain('—');
  });

  it("renders TP's eligible teamRace codes, one row per (rules set, code)", async () => {
    const d = deps();
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Eldril Sidewinder',
          entries: [
            {
              rulesSet: 'BB2020',
              cost: null,
              specialRuleName: 'Elven Kingdoms League',
              characteristics: null,
              eligibleTeamRaces: ['highelf', 'woodelf'],
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('TP');
    expect(html).toContain('highelf');
    expect(html).toContain('woodelf');
    expect(html).toContain('Elven Kingdoms League');
  });

  it('highlights TP entries that have no eligible teamRace codes instead of an empty table', async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Eldril Sidewinder',
        cost: null,
        canPlayFor: 'Any team with Elven Kingdoms League',
        skills: null,
        characteristics: null,
      },
      notFoundNote: '',
    });
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Eldril Sidewinder',
          entries: [
            {
              rulesSet: 'BB2020',
              cost: null,
              specialRuleName: 'Elven Kingdoms League',
              characteristics: null,
              eligibleTeamRaces: [],
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('TP');
    expect(html).toContain('no eligible teamRace codes');
    expect(html).toContain('class="mismatch"');
  });

  it('contributes a curated availability entry matching by name, and skips a non-matching entry', async () => {
    const d = deps();
    d.manual.availability.mockResolvedValue([
      {
        name: 'Eldril Sidewinder',
        externalIds: [],
        raceEras: [
          {
            race: { system: 'Name', id: 'Wood Elf' },
            era: { system: 'Name', id: 'BB2020 era' },
          },
        ],
      },
      {
        name: 'Someone Else',
        externalIds: [],
        raceEras: [
          {
            race: { system: 'Name', id: 'Orc' },
            era: { system: 'Name', id: 'BB2020 era' },
          },
        ],
      },
    ]);
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('Manual curation');
    expect(html).toContain('Wood Elf');
    expect(html).not.toContain('Orc');
  });

  it('contributes a curated availability entry matching by external id', async () => {
    const d = deps();
    d.externalIds.allForPosition.mockResolvedValue([
      { systemName: 'BBL', externalId: '126-44' },
    ]);
    d.manual.availability.mockResolvedValue([
      {
        name: 'Some Other Spelling',
        externalIds: [{ system: 'BBL', id: '126-44' }],
        raceEras: [
          {
            race: { system: 'Name', id: 'Wood Elf' },
            era: { system: 'Name', id: 'BB2020 era' },
          },
        ],
      },
    ]);
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('Manual curation');
    expect(html).toContain('Wood Elf');
  });

  it('renders a WIDER IN DB verdict highlighted when the DB has more races than TP supports', async () => {
    const d = deps();
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Eldril Sidewinder',
          entries: [
            {
              rulesSet: 'BB2020',
              cost: null,
              specialRuleName: null,
              characteristics: null,
              eligibleTeamRaces: ['highelf'],
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    d.query.hireEligibilityFor.mockResolvedValue(
      [1, 2, 3, 4, 5].map((raceId) => ({
        raceId,
        raceName: `Race ${raceId}`,
        eraId: 1,
        eraName: 'Era',
        startDate: '2020-11-28',
        endDate: null,
      })),
    );
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('<tr class="mismatch">');
    expect(html).toContain(
      '<td>5</td><td>1</td><td class="mismatch-cell">WIDER IN DB</td>',
    );
  });

  it('leaves the count columns unemphasised in a WIDER IN DB verdict row', async () => {
    const d = deps();
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Eldril Sidewinder',
          entries: [
            {
              rulesSet: 'BB2020',
              cost: null,
              specialRuleName: null,
              characteristics: null,
              eligibleTeamRaces: ['highelf'],
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    d.query.hireEligibilityFor.mockResolvedValue(
      [1, 2, 3, 4, 5].map((raceId) => ({
        raceId,
        raceName: `Race ${raceId}`,
        eraId: 1,
        eraName: 'Era',
        startDate: '2020-11-28',
        endDate: null,
      })),
    );
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).not.toContain('<td class="mismatch-cell">5</td>');
    expect(html).not.toContain('<td class="mismatch-cell">1</td>');
  });

  it('renders a NARROWER IN DB verdict highlighted when the DB has fewer races than TP supports', async () => {
    const d = deps();
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Eldril Sidewinder',
          entries: [
            {
              rulesSet: 'BB2020',
              cost: null,
              specialRuleName: null,
              characteristics: null,
              eligibleTeamRaces: ['highelf', 'woodelf', 'dwarf'],
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    d.query.hireEligibilityFor.mockResolvedValue([
      {
        raceId: 1,
        raceName: 'Wood Elf',
        eraId: 1,
        eraName: 'Era',
        startDate: '2020-11-28',
        endDate: null,
      },
    ]);
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('<tr class="mismatch">');
    expect(html).toContain(
      '<td>1</td><td>3</td><td class="mismatch-cell">NARROWER IN DB</td>',
    );
  });

  it('leaves the count columns unemphasised in a NARROWER IN DB verdict row', async () => {
    const d = deps();
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Eldril Sidewinder',
          entries: [
            {
              rulesSet: 'BB2020',
              cost: null,
              specialRuleName: null,
              characteristics: null,
              eligibleTeamRaces: ['highelf', 'woodelf', 'dwarf'],
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    d.query.hireEligibilityFor.mockResolvedValue([
      {
        raceId: 1,
        raceName: 'Wood Elf',
        eraId: 1,
        eraName: 'Era',
        startDate: '2020-11-28',
        endDate: null,
      },
    ]);
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).not.toContain('<td class="mismatch-cell">1</td>');
    expect(html).not.toContain('<td class="mismatch-cell">3</td>');
  });

  it('labels a matching race count without claiming race identity was compared', async () => {
    const d = deps();
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Eldril Sidewinder',
          entries: [
            {
              rulesSet: 'BB2020',
              cost: null,
              specialRuleName: null,
              characteristics: null,
              eligibleTeamRaces: ['highelf'],
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    d.query.hireEligibilityFor.mockResolvedValue([
      {
        raceId: 1,
        raceName: 'Wood Elf',
        eraId: 1,
        eraName: 'Era',
        startDate: '2020-11-28',
        endDate: null,
      },
    ]);
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('counts match (race identity not compared)');
    expect(html).not.toContain('WIDER IN DB');
    expect(html).not.toContain('NARROWER IN DB');
  });

  it('renders no verdict when TP carries no entry for the star', async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Eldril Sidewinder',
        cost: null,
        canPlayFor: 'Any team with Elven Kingdoms League',
        skills: null,
        characteristics: null,
      },
      notFoundNote: '',
    });
    d.query.hireEligibilityFor.mockResolvedValue([
      {
        raceId: 1,
        raceName: 'Wood Elf',
        eraId: 1,
        eraName: 'Era',
        startDate: '2020-11-28',
        endDate: null,
      },
    ]);
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).not.toContain('Race-count comparison');
    expect(html).not.toContain('WIDER IN DB');
  });
});
