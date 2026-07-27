import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HtmlService } from '../shared/html.service';
import type { SampledMatch } from '../shared/review.types';
import type { ReviewReport } from './report-builder.service';
import { ReportBuilderService } from './report-builder.service';

const match: SampledMatch = {
  source: 'bbl',
  matchId: 11,
  externalId: '1830',
  matchName: 'Round 3',
  competitionName: 'Season 18',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
  selectedFor: ['Contains a foul', 'override'],
};

const report: ReviewReport = {
  generatedAt: new Date('2026-07-27T09:00:00.000Z'),
  gaps: [],
  matches: [
    {
      match,
      panels: [
        {
          dataTypeId: 'match-events',
          rawHtml: '<p>raw panel</p>',
          importedHtml: '<p>imported panel</p>',
        },
      ],
    },
  ],
};

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ReportBuilderService, HtmlService],
    }).compile();
    service = moduleRef.get(ReportBuilderService);
  });

  it('builds a standalone HTML document', () => {
    const html = service.build(report);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Match import review</title>');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('states when the report was generated and how many matches it covers', () => {
    const html = service.build(report);

    expect(html).toContain('2026-07-27T09:00:00.000Z');
    expect(html).toContain('1 match');
  });

  it('heads each match with its source, ids, competition and play date', () => {
    const html = service.build(report);

    expect(html).toContain('BBL match 1830');
    expect(html).toContain('Season 18');
    expect(html).toContain('Round 3');
    expect(html).toContain('2021-09-25');
    expect(html).toContain('db id 11');
  });

  it('lists every reason a match was selected', () => {
    const html = service.build(report);

    expect(html).toContain('Contains a foul');
    expect(html).toContain('override');
  });

  it('places the raw and imported panels side by side, unescaped', () => {
    const html = service.build(report);

    expect(html).toContain('<p>raw panel</p>');
    expect(html).toContain('<p>imported panel</p>');
    expect(html.indexOf('<p>raw panel</p>')).toBeLessThan(
      html.indexOf('<p>imported panel</p>'),
    );
    expect(html).toContain('class="panels"');
  });

  it('names the data type of each panel pair', () => {
    const html = service.build(report);

    expect(html).toContain('match-events');
  });

  it('reports gaps when there are any', () => {
    const html = service.build({
      ...report,
      gaps: [{ source: 'tp', reason: 'No match found for stratum "X"' }],
    });

    expect(html).toContain('Gaps');
    expect(html).toContain('TP');
    expect(html).toContain('No match found for stratum &quot;X&quot;');
  });

  it('says so explicitly when there are no gaps', () => {
    const html = service.build(report);

    expect(html).toContain('No gaps');
  });

  it('says so explicitly when no match was sampled at all', () => {
    const html = service.build({ ...report, matches: [] });

    expect(html).toContain('No matches were sampled');
  });
});
