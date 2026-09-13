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
import { StarPlayerIdentityRawRendererService } from './identity-raw-renderer.service';

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
  manual.starPlayers.mockResolvedValue([]);
  return { externalIds, bbl, tp, manual };
}

async function makeService(
  overrides: Deps,
): Promise<StarPlayerIdentityRawRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerIdentityRawRendererService,
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
  return moduleRef.get(StarPlayerIdentityRawRendererService);
}

describe('StarPlayerIdentityRawRendererService', () => {
  it('renders a note when no source carries the star', async () => {
    const service = await makeService(deps());

    expect(await service.render(STAR)).toContain('No raw data');
  });

  it("renders BBL's page found by typID", async () => {
    const d = deps();
    d.externalIds.bblTypIdsFor.mockResolvedValue(['126']);
    d.bbl.starFor.mockResolvedValue({
      typId: '126',
      name: 'Eldril Sidewinder',
      cost: '230 000 gp',
      canPlayFor: 'Any team with Elven Kingdoms League',
      skills: 'Catch, Dodge',
      characteristics: null,
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BBL');
    expect(html).toContain('230 000 gp');
    expect(html).toContain('126');
  });

  it('falls back to a BBL name lookup when the star carries no BBL typID', async () => {
    const d = deps();
    d.bbl.starForName.mockResolvedValue({
      typId: '126',
      name: 'Eldril Sidewinder',
      cost: null,
      canPlayFor: null,
      skills: null,
      characteristics: null,
    });
    const service = await makeService(d);

    await service.render(STAR);

    expect(d.bbl.starForName).toHaveBeenCalledWith('Eldril Sidewinder');
  });

  it("renders TP's per-rules-set costs, looked up by each TP spelling", async () => {
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
          rulesSet: 'BB2025',
          cost: 220000,
          specialRuleName: 'Elven Kingdoms League',
          characteristics: null,
          eligibleTeamRaces: ['WoodElf_BB2025'],
        },
      ],
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BB2025');
    expect(html).toContain('220000');
  });

  it('renders the curated entry matched by external id', async () => {
    const d = deps();
    d.externalIds.allForPosition.mockResolvedValue([
      { systemName: 'Name', externalId: 'Eldril Sidewinder' },
    ]);
    d.manual.starPlayers.mockResolvedValue([
      {
        name: 'Eldril Sidewinder',
        externalIds: [{ system: 'Name', id: 'Eldril Sidewinder' }],
      },
      { name: 'Someone Else', externalIds: [] },
    ]);
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('Manual curation');
    expect(html).not.toContain('Someone Else');
  });

  it('highlights a BBL/TP name disagreement beyond spelling conventions', async () => {
    const d = deps();
    d.externalIds.bblTypIdsFor.mockResolvedValue(['126']);
    d.bbl.starFor.mockResolvedValue({
      typId: '126',
      name: 'Griff Oberwald',
      cost: null,
      canPlayFor: null,
      skills: null,
      characteristics: null,
    });
    d.externalIds.forPosition.mockResolvedValue({
      bbl: [],
      tp: ['Eldril Sidewinder'],
      name: [],
    });
    d.tp.starFor.mockResolvedValue({
      name: 'Eldril Sidewinder',
      entries: [],
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('MISMATCH');
  });

  it('does not call a duo-star spelling difference a mismatch', async () => {
    const d = deps();
    d.externalIds.bblTypIdsFor.mockResolvedValue(['126']);
    d.bbl.starFor.mockResolvedValue({
      typId: '126',
      name: 'Dolfar Longstride (& Grak)',
      cost: null,
      canPlayFor: null,
      skills: null,
      characteristics: null,
    });
    d.externalIds.forPosition.mockResolvedValue({
      bbl: [],
      tp: ['Dolfar Longstride'],
      name: [],
    });
    d.tp.starFor.mockResolvedValue({ name: 'Dolfar Longstride', entries: [] });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('agree');
    expect(html).not.toContain('MISMATCH');
  });
});
