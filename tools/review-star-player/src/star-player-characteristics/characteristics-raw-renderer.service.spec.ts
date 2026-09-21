import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { StarPlayerCharacteristicsRawRendererService } from './characteristics-raw-renderer.service';

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
  manual.characteristics.mockResolvedValue([]);
  return { externalIds, lookup, manual };
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
      { provide: StarSourceLookupService, useValue: overrides.lookup },
      { provide: ManualRawDataService, useValue: overrides.manual },
      StarPlayerNameMatcherService,
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(StarPlayerCharacteristicsRawRendererService);
}

describe('StarPlayerCharacteristicsRawRendererService', () => {
  it('highlights BBL and TP as not found when neither source carries the star', async () => {
    const service = await makeService(deps());

    const html = await service.render(STAR);

    expect(html).toContain('no BBL page found for');
    expect(html).toContain('no TP entry found for spelling(s)');
    expect(html).toContain('class="mismatch"');
  });

  it("renders BBL's stat line with its +-suffixed values verbatim", async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Eldril Sidewinder',
        cost: null,
        canPlayFor: null,
        skills: null,
        skillRefs: [],
        characteristics: {
          move: '8',
          strength: '3',
          agility: '2+',
          passing: '5+',
          armour: '8+',
        },
      },
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BBL');
    expect(html).toContain('2+');
    expect(html).toContain('5+');
    expect(html).toContain('8+');
  });

  it('renders a dash for BBL passing when the page has no passing value', async () => {
    const d = deps();
    d.lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '126',
        name: 'Eldril Sidewinder',
        cost: null,
        canPlayFor: null,
        skills: null,
        skillRefs: [],
        characteristics: {
          move: '8',
          strength: '3',
          agility: '2+',
          passing: null,
          armour: '8+',
        },
      },
      notFoundNote: '',
    });
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('BBL');
    expect(html).toContain('8');
    expect(html).toContain('3');
    expect(html).toContain('2+');
    expect(html).toContain('8+');
    expect(html).toContain('—');
  });

  it('highlights a BBL page with unreadable characteristics', async () => {
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
    const service = await makeService(d);

    const html = await service.render(STAR);

    expect(html).toContain('unreadable');
    expect(html).toContain('class="mismatch"');
  });

  it("renders TP's two rules-set rows with their own rules-set labels", async () => {
    const d = deps();
    d.lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
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
              skills: [],
              keywordCodes: [],
              positionTypes: null,
              isBigGuy: false,
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

    expect(html).toContain('BB2020');
    expect(html).toContain('BB2025');
  });

  it('renders a TP entry with unreadable characteristics as dashes', async () => {
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
              eligibleTeamRaces: [],
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

  it('falls back to a normalized Name match when the star owns no external ids', async () => {
    const d = deps();
    d.externalIds.allForPosition.mockResolvedValue([]);
    d.manual.characteristics.mockResolvedValue([
      {
        // Case-only difference from STAR.positionName — refMatches cannot
        // succeed (no owned external ids), so this can only be found through
        // StarPlayerNameMatcherService.normalize()'s case-folding.
        position: { system: 'Name', id: 'eldril sidewinder' },
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
