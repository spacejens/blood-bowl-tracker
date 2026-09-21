import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { StarPlayerIdentityRawRendererService } from './identity-raw-renderer.service';

const STAR = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

interface Deps {
  externalIds: MockProxy<StarPlayerExternalIdsService>;
  lookup: MockProxy<StarSourceLookupService>;
  manual: MockProxy<ManualRawDataService>;
}

function deps(): Deps {
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
  manual.starPlayers.mockResolvedValue([]);
  return { externalIds, lookup, manual };
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
      { provide: StarSourceLookupService, useValue: overrides.lookup },
      { provide: ManualRawDataService, useValue: overrides.manual },
      StarPlayerNameMatcherService,
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(StarPlayerIdentityRawRendererService);
}

describe('StarPlayerIdentityRawRendererService', () => {
  it('highlights BBL and TP as not found when neither source has the star', async () => {
    const service = await makeService(deps());

    const html = await service.render(STAR);

    expect(html).toContain('no BBL page found for');
    expect(html).toContain('no TP entry found for spelling(s)');
    expect(html).toContain('class="mismatch"');
  });

  it("renders BBL's page found by typID", async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Eldril Sidewinder',
        cost: '230 000 gp',
        canPlayFor: 'Any team with Elven Kingdoms League',
        skills: 'Catch, Dodge',
        skillRefs: [],
        characteristics: null,
      },
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BBL');
    expect(html).toContain('230 000 gp');
    expect(html).toContain('126');
  });

  it("renders TP's per-rules-set costs", async () => {
    const d = deps();
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Eldril Sidewinder',
          entries: [
            {
              rulesSet: 'BB2025',
              cost: 220000,
              specialRuleName: 'Elven Kingdoms League',
              characteristics: null,
              eligibleTeamRaces: ['WoodElf_BB2025'],
              skills: [],
              keywordCodes: [],
              positionTypes: null,
              isBigGuy: false,
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BB2025');
    expect(html).toContain('220000');
  });

  it('renders the curated entry matched by external id, independent of name matching', async () => {
    const d = deps();
    d.externalIds.allForPosition.mockResolvedValue([
      { systemName: 'Name', externalId: 'Eldril Sidewinder' },
    ]);
    d.manual.starPlayers.mockResolvedValue([
      {
        // Deliberately not STAR.positionName, so this entry can only match
        // through its external id — matchesName(...) must not short-circuit.
        name: 'Curated Alias For Eldril',
        externalIds: [{ system: 'Name', id: 'Eldril Sidewinder' }],
      },
      { name: 'Someone Else', externalIds: [] },
    ]);
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('Manual curation');
    expect(html).toContain('Curated Alias For Eldril');
    expect(html).not.toContain('Someone Else');
  });

  it('highlights a missing curated entry instead of omitting the manual section', async () => {
    const service = await makeService(deps());

    const html = await service.render(STAR);

    expect(html).toContain('Manual curation');
    expect(html).toContain(
      'no curated entry found for &quot;Eldril Sidewinder&quot;',
    );
    expect(html).toContain('class="mismatch"');
  });

  it('highlights a BBL/TP name disagreement beyond spelling conventions', async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Griff Oberwald',
        cost: null,
        canPlayFor: null,
        skills: null,
        skillRefs: [],
        characteristics: null,
      },
      notFoundNote: '',
    });
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [{ name: 'Eldril Sidewinder', entries: [] }],
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('<tr class="mismatch">');
    expect(html).toContain(
      '<td>Griff Oberwald</td><td>Eldril Sidewinder</td><td class="mismatch-cell">MISMATCH</td>',
    );
  });

  it('leaves the name columns unemphasised in a verdict mismatch row', async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Griff Oberwald',
        cost: null,
        canPlayFor: null,
        skills: null,
        skillRefs: [],
        characteristics: null,
      },
      notFoundNote: '',
    });
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [{ name: 'Eldril Sidewinder', entries: [] }],
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).not.toContain('<td class="mismatch-cell">Griff Oberwald</td>');
    expect(html).not.toContain(
      '<td class="mismatch-cell">Eldril Sidewinder</td>',
    );
  });

  it('flags a mismatch carried by a second TP spelling, not just the first', async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Eldril Sidewinder',
        cost: null,
        canPlayFor: null,
        skills: null,
        skillRefs: [],
        characteristics: null,
      },
      notFoundNote: '',
    });
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        { name: 'Eldril Sidewinder', entries: [] },
        { name: 'Something Entirely Different', entries: [] },
      ],
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('agree');
    expect(html).toContain('MISMATCH');
    expect(html).toContain('Something Entirely Different');
  });

  it('does not call a duo-star spelling difference a mismatch', async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Dolfar Longstride (& Grak)',
        cost: null,
        canPlayFor: null,
        skills: null,
        skillRefs: [],
        characteristics: null,
      },
      notFoundNote: '',
    });
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [{ name: 'Dolfar Longstride', entries: [] }],
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('agree');
    expect(html).not.toContain('MISMATCH');
  });
});
