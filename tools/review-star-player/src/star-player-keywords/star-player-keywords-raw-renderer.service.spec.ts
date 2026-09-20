import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { StarPlayerKeywordsRawRendererService } from './star-player-keywords-raw-renderer.service';

const star: SampledStarPlayer = {
  positionId: 42,
  positionName: 'Grombrindal',
  selectedFor: ['Random sample'],
};

describe('StarPlayerKeywordsRawRendererService', () => {
  let service: StarPlayerKeywordsRawRendererService;
  let lookup: MockProxy<StarSourceLookupService>;
  let manual: MockProxy<ManualRawDataService>;

  beforeEach(async () => {
    lookup = mock<StarSourceLookupService>();
    manual = mock<ManualRawDataService>();
    lookup.tpStarsFor.mockResolvedValue({
      stars: [],
      notFoundNote: 'no TP entry found for spelling(s) Grombrindal',
    });
    manual.keywords.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerKeywordsRawRendererService,
        { provide: StarSourceLookupService, useValue: lookup },
        { provide: ManualRawDataService, useValue: manual },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(StarPlayerKeywordsRawRendererService);
  });

  it('renders a star keyword codes with their curated names per rules set', async () => {
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
              keywordCodes: [111, 110],
            },
          ],
        },
      ],
      notFoundNote: '',
    });
    manual.keywords.mockResolvedValue([
      { name: 'Goblin', kind: 'species', code: '111' },
      { name: 'Undead', kind: 'species', code: '110' },
    ]);

    const html = await service.render(star);

    expect(html).toContain('<h5>TP</h5>');
    expect(html).toContain('Goblin (111)');
    expect(html).toContain('Undead (110)');
  });

  it('highlights a code no curated keyword carries', async () => {
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
              keywordCodes: [777],
            },
          ],
        },
      ],
      notFoundNote: '',
    });

    const html = await service.render(star);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('not curated');
    expect(html).toContain('777');
  });

  it('shows "none" for a star TP gives no codes', async () => {
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

    expect(html).toContain('<tr><td>BB2025</td><td>none</td></tr>');
  });

  it('notes that the star is not in the downloaded TP data', async () => {
    const html = await service.render(star);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('no TP entry found for spelling(s) Grombrindal');
  });
});
