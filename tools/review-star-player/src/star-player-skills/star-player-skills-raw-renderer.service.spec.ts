import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import { TpSkillMasterNamesService } from '../source/tp-skill-master-names.service';
import { StarPlayerSkillsRawRendererService } from './star-player-skills-raw-renderer.service';

const star: SampledStarPlayer = {
  positionId: 42,
  positionName: 'Grombrindal',
  selectedFor: ['Random sample'],
};

describe('StarPlayerSkillsRawRendererService', () => {
  let service: StarPlayerSkillsRawRendererService;
  let lookup: MockProxy<StarSourceLookupService>;
  let masters: MockProxy<TpSkillMasterNamesService>;

  beforeEach(async () => {
    lookup = mock<StarSourceLookupService>();
    masters = mock<TpSkillMasterNamesService>();
    lookup.bblStarFor.mockResolvedValue({
      star: null,
      notFoundNote: 'no BBL page found for typID(s) 900',
    });
    lookup.tpStarsFor.mockResolvedValue({
      stars: [],
      notFoundNote: 'no TP entry found for spelling(s) Grombrindal',
    });
    masters.masterFor.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerSkillsRawRendererService,
        { provide: StarSourceLookupService, useValue: lookup },
        { provide: TpSkillMasterNamesService, useValue: masters },
        HtmlService,
        SkillFormatService,
      ],
    }).compile();
    service = moduleRef.get(StarPlayerSkillsRawRendererService);
  });

  it("lists the BBL page's starting skills", async () => {
    lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '900',
        name: 'Grombrindal',
        cost: '250 000 gp',
        canPlayFor: 'Any team',
        skills: 'Block, Loner (4+)',
        skillRefs: [
          { name: 'Block', attributeValue: null },
          { name: 'Loner', attributeValue: '4+' },
        ],
        characteristics: null,
      },
      notFoundNote: '',
    });

    const html = await service.render(star);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain('<td>Block, Loner (4+)</td>');
  });

  it("shows 'none' when the BBL page's Skills cell was empty", async () => {
    lookup.bblStarFor.mockResolvedValue({
      star: {
        typId: '900',
        name: 'Grombrindal',
        cost: '250 000 gp',
        canPlayFor: 'Any team',
        skills: '',
        skillRefs: [],
        characteristics: null,
      },
      notFoundNote: '',
    });

    const html = await service.render(star);

    expect(html).toContain('<h5>BBL</h5>');
    expect(html).toContain('<tr><td>none</td></tr>');
  });

  it('highlights the BBL sub-panel when no page was found', async () => {
    const html = await service.render(star);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('no BBL page found for typID(s) 900');
  });

  it("lists TP's per-rules-set skills, resolved to names", async () => {
    lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Grombrindal',
          entries: [
            {
              rulesSet: 'BB2025',
              cost: 250000,
              specialRuleName: null,
              characteristics: null,
              eligibleTeamRaces: [],
              skills: [{ skillMasterId: 220, attributeValue: null }],
              keywordCodes: [],
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    masters.masterFor.mockResolvedValue({ name: 'Block', isElite: true });

    const html = await service.render(star);

    expect(html).toContain('<h5>TP</h5>');
    // Elite is advancement-only: a starting skill never carries the marker.
    expect(html).toContain('<td>BB2025</td><td>Block</td>');
  });

  it("merges TP's specialRuleName in as the star's own unique skill", async () => {
    lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Rodney Roachbait',
          entries: [
            {
              rulesSet: 'BB2025',
              cost: 70000,
              specialRuleName: 'Catch of the Day',
              characteristics: null,
              eligibleTeamRaces: [],
              skills: [],
              keywordCodes: [],
            },
          ],
        },
      ],
      notFoundNote: '',
    });

    const html = await service.render(star);

    expect(html).toContain('★ Catch of the Day');
  });

  it('shows an unresolvable TP skill master id as such', async () => {
    lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Grombrindal',
          entries: [
            {
              rulesSet: 'BB2025',
              cost: null,
              specialRuleName: null,
              characteristics: null,
              eligibleTeamRaces: [],
              skills: [{ skillMasterId: 999, attributeValue: null }],
              keywordCodes: [],
            },
          ],
        },
      ],
      notFoundNote: '',
    });

    const html = await service.render(star);

    expect(html).toContain('skill master #999');
  });

  it("shows 'none' for a TP entry with no starting skills recorded", async () => {
    lookup.tpStarsFor.mockResolvedValue({
      stars: [
        {
          name: 'Grombrindal',
          entries: [
            {
              rulesSet: 'BB2025',
              cost: 250000,
              specialRuleName: null,
              characteristics: null,
              eligibleTeamRaces: [],
              skills: [],
              keywordCodes: [],
            },
          ],
        },
      ],
      notFoundNote: '',
    });

    const html = await service.render(star);

    expect(html).toContain('<h5>TP</h5>');
    expect(html).toContain('<tr><td>BB2025</td><td>none</td></tr>');
  });

  it('highlights the TP sub-panel when no entry was found', async () => {
    const html = await service.render(star);

    expect(html).toContain('no TP entry found for spelling(s) Grombrindal');
  });
});
