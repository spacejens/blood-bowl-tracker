import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { BblRawStarPlayerPageService } from '../source/bbl-raw-star-player-page.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { TpRawStarPlayerIndexService } from '../source/tp-raw-star-player-index.service';
import { StarPlayerCharacteristicsRawRendererService } from './characteristics-raw-renderer.service';

const STAR = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

interface Deps {
  externalIds: MockProxy<StarPlayerExternalIdsService>;
  bbl: MockProxy<BblRawStarPlayerPageService>;
  tp: MockProxy<TpRawStarPlayerIndexService>;
  manual: MockProxy<ManualRawDataService>;
}

function deps(): Deps {
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
  manual.characteristics.mockResolvedValue([]);
  return { externalIds, bbl, tp, manual };
}

async function makeService(
  overrides: Deps,
): Promise<StarPlayerCharacteristicsRawRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerCharacteristicsRawRendererService,
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
  return moduleRef.get(StarPlayerCharacteristicsRawRendererService);
}

describe('StarPlayerCharacteristicsRawRendererService', () => {
  it('renders a note when no source carries characteristics for the star', async () => {
    const service = await makeService(deps());

    expect(await service.render(STAR)).toContain('No raw characteristics');
  });

  it("renders BBL's stat line with its +-suffixed values verbatim", async () => {
    const d = deps();
    d.externalIds.bblTypIdsFor.mockResolvedValue(['126']);
    d.bbl.starFor.mockResolvedValue({
      typId: '126',
      name: 'Eldril Sidewinder',
      cost: null,
      canPlayFor: null,
      skills: null,
      characteristics: {
        move: '8',
        strength: '3',
        agility: '2+',
        passing: '5+',
        armour: '8+',
      },
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BBL');
    expect(html).toContain('2+');
    expect(html).toContain('5+');
    expect(html).toContain('8+');
  });

  it('highlights a BBL page with unreadable characteristics', async () => {
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

    expect(html).toContain('unreadable');
    expect(html).toContain('class="mismatch"');
  });

  it("renders TP's two rules-set rows with their own rules-set labels", async () => {
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
          cost: 230000,
          specialRuleName: null,
          characteristics: {
            move: 8,
            strength: 3,
            agility: 2,
            passing: 5,
            armour: 8,
          },
          eligibleTeamRaces: [],
        },
        {
          rulesSet: 'BB2025',
          cost: 220000,
          specialRuleName: null,
          characteristics: {
            move: 8,
            strength: 3,
            agility: 3,
            passing: 0,
            armour: 8,
          },
          eligibleTeamRaces: [],
        },
      ],
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BB2020');
    expect(html).toContain('BB2025');
  });

  it('renders a TP entry with unreadable characteristics as dashes', async () => {
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
          eligibleTeamRaces: [],
        },
      ],
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BB2020');
    expect(html).toContain('—');
  });

  it('renders the curated entry matching by Name external id', async () => {
    const d = deps();
    d.externalIds.allForPosition.mockResolvedValue([
      { systemName: 'Name', externalId: 'Eldril Sidewinder' },
    ]);
    d.manual.characteristics.mockResolvedValue([
      {
        position: { system: 'Name', id: 'Eldril Sidewinder' },
        rulesSet: { system: 'Name', id: 'BB2020' },
        move: 8,
        strength: 3,
        agility: 2,
        passing: 5,
        armour: 8,
      },
      {
        position: { system: 'Name', id: 'Someone Else' },
        rulesSet: { system: 'Name', id: 'BB2020' },
        move: 8,
        strength: 3,
        agility: 2,
        passing: 5,
        armour: 8,
      },
    ]);
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('Manual curation');
    expect(html).toContain('BB2020');
    expect(html).not.toContain('Someone Else');
  });

  it('renders a curated entry omitting passing as a dash', async () => {
    const d = deps();
    d.externalIds.allForPosition.mockResolvedValue([
      { systemName: 'Name', externalId: 'Eldril Sidewinder' },
    ]);
    d.manual.characteristics.mockResolvedValue([
      {
        position: { system: 'Name', id: 'Eldril Sidewinder' },
        rulesSet: { system: 'Name', id: 'CRP' },
        move: 8,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 8,
      },
    ]);
    const service = await makeService(d);

    expect(await service.render(STAR)).toContain('—');
  });
});
