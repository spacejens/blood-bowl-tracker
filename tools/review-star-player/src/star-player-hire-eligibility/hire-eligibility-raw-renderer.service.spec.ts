import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';
import { BblRawStarPlayerPageService } from '../source/bbl-raw-star-player-page.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { TpRawStarPlayerIndexService } from '../source/tp-raw-star-player-index.service';
import { HireEligibilityRawRendererService } from './hire-eligibility-raw-renderer.service';

const STAR = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

interface Deps {
  query: MockProxy<StarPlayerPositionsQueryService>;
  externalIds: MockProxy<StarPlayerExternalIdsService>;
  bbl: MockProxy<BblRawStarPlayerPageService>;
  tp: MockProxy<TpRawStarPlayerIndexService>;
  manual: MockProxy<ManualRawDataService>;
}

function deps(): Deps {
  const query = mock<StarPlayerPositionsQueryService>();
  query.hireEligibilityFor.mockResolvedValue([]);
  const externalIds = mock<StarPlayerExternalIdsService>();
  externalIds.bblTypIdsFor.mockResolvedValue([]);
  externalIds.forPosition.mockResolvedValue({ bbl: [], tp: [], name: [] });
  externalIds.allForPosition.mockResolvedValue([]);
  const bbl = mock<BblRawStarPlayerPageService>();
  bbl.starFor.mockResolvedValue(null);
  bbl.starForName.mockResolvedValue(null);
  const tp = mock<TpRawStarPlayerIndexService>();
  tp.starFor.mockResolvedValue(null);
  const manual = mock<ManualRawDataService>();
  manual.availability.mockResolvedValue([]);
  return { query, externalIds, bbl, tp, manual };
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
      { provide: BblRawStarPlayerPageService, useValue: overrides.bbl },
      { provide: TpRawStarPlayerIndexService, useValue: overrides.tp },
      { provide: ManualRawDataService, useValue: overrides.manual },
      StarPlayerNameMatcherService,
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(HireEligibilityRawRendererService);
}

describe('HireEligibilityRawRendererService', () => {
  it('renders a note when no source carries hire-eligibility data for the star', async () => {
    const service = await makeService(deps());

    expect(await service.render(STAR)).toContain(
      'No raw hire-eligibility data',
    );
  });

  it("renders BBL's Can play for text verbatim", async () => {
    const d = deps();
    d.externalIds.bblTypIdsFor.mockResolvedValue(['126']);
    d.bbl.starFor.mockResolvedValue({
      typId: '126',
      name: 'Eldril Sidewinder',
      cost: null,
      canPlayFor: 'Any team with Elven Kingdoms League',
      skills: null,
      characteristics: null,
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BBL');
    expect(html).toContain('Any team with Elven Kingdoms League');
  });

  it('renders — for a BBL page with canPlayFor: null', async () => {
    const d = deps();
    d.externalIds.bblTypIdsFor.mockResolvedValue(['126']);
    d.bbl.starFor.mockResolvedValue({
      typId: '126',
      name: 'Eldril Sidewinder',
      cost: null,
      canPlayFor: null,
      skills: null,
      characteristics: null,
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BBL');
    expect(html).toContain('—');
  });

  it("renders TP's eligible teamRace codes, one row per (rules set, code)", async () => {
    const d = deps();
    d.externalIds.forPosition.mockResolvedValue({
      bbl: [],
      tp: ['Eldril Sidewinder'],
      name: [],
    });
    d.tp.starFor.mockResolvedValue({
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
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('TP');
    expect(html).toContain('highelf');
    expect(html).toContain('woodelf');
    expect(html).toContain('Elven Kingdoms League');
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
    d.externalIds.forPosition.mockResolvedValue({
      bbl: [],
      tp: ['Eldril Sidewinder'],
      name: [],
    });
    d.tp.starFor.mockResolvedValue({
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

    expect(html).toContain('WIDER IN DB');
    expect(html).toContain('class="mismatch"');
  });

  it('renders no verdict when TP carries no entry for the star', async () => {
    const d = deps();
    d.externalIds.bblTypIdsFor.mockResolvedValue(['126']);
    d.bbl.starFor.mockResolvedValue({
      typId: '126',
      name: 'Eldril Sidewinder',
      cost: null,
      canPlayFor: 'Any team with Elven Kingdoms League',
      skills: null,
      characteristics: null,
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
