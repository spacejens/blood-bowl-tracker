import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SampledStarPlayer } from '../shared/review.types';
import { ReportBuilderService } from './report-builder.service';

const star: SampledStarPlayer = {
  positionId: 7,
  positionName: 'Griff Oberwald',
  selectedFor: ['Random sample', 'override'],
};

const generatedAt = new Date('2026-08-26T09:00:00.000Z');

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ReportBuilderService, HtmlService],
    }).compile();
    service = moduleRef.get(ReportBuilderService);
  });

  it('titles the document for star player review', () => {
    const html = service.build({ items: [], gaps: [], generatedAt });

    expect(html).toContain('<title>Star player import review</title>');
    expect(html).toContain('<h1>Star player import review</h1>');
  });

  it('uses the plural noun for zero stars and the singular for one', () => {
    const noStars = service.build({ items: [], gaps: [], generatedAt });
    const oneStar = service.build({
      items: [{ item: star, panels: [] }],
      gaps: [],
      generatedAt,
    });

    expect(noStars).toContain('0 star players.');
    expect(oneStar).toContain('1 star player.');
  });

  it("heads each star section with the star's name and position id", () => {
    const html = service.build({
      items: [{ item: star, panels: [] }],
      gaps: [],
      generatedAt,
    });

    expect(html).toContain('Griff Oberwald (position id 7)');
  });

  it('lists the selectedFor reasons joined by ", "', () => {
    const html = service.build({
      items: [{ item: star, panels: [] }],
      gaps: [],
      generatedAt,
    });

    expect(html).toContain('Selected for: Random sample, override');
  });

  it("inserts each panel's rawHtml and importedHtml verbatim", () => {
    const html = service.build({
      items: [
        {
          item: star,
          panels: [
            {
              dataTypeId: 'star-player-identity',
              rawHtml: '<p>raw fragment</p>',
              importedHtml: '<p>imported fragment</p>',
            },
          ],
        },
      ],
      gaps: [],
      generatedAt,
    });

    expect(html).toContain('<p>raw fragment</p>');
    expect(html).toContain('<p>imported fragment</p>');
    expect(html).toContain('<h3>star-player-identity</h3>');
  });

  it('escapes a star name containing "<"', () => {
    const html = service.build({
      items: [{ item: { ...star, positionName: '<script>' }, panels: [] }],
      gaps: [],
      generatedAt,
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders the gaps table when gaps are present', () => {
    const html = service.build({
      items: [],
      gaps: [{ source: 'bbl', reason: 'No star player found for stratum "X"' }],
      generatedAt,
    });

    expect(html).toContain('<h2>Gaps</h2>');
    expect(html).toContain('BBL');
    expect(html).toContain('No star player found for stratum &quot;X&quot;');
  });
});
