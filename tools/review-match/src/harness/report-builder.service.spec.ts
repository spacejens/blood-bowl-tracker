import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { MatchCategoryLabelService } from '../shared/match-category-label.service';
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
  category: 'normal',
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

/** `report`, with its lone match replaced by `overrides` merged over `match`. */
function reportWith(overrides: Partial<SampledMatch>): ReviewReport {
  return {
    ...report,
    matches: [{ ...report.matches[0], match: { ...match, ...overrides } }],
  };
}

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;
  let categoryLabel: ReturnType<typeof mock<MatchCategoryLabelService>>;

  beforeEach(async () => {
    categoryLabel = mock<MatchCategoryLabelService>();
    categoryLabel.label.mockReturnValue('Normal');
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportBuilderService,
        HtmlService,
        { provide: MatchCategoryLabelService, useValue: categoryLabel },
      ],
    }).compile();
    service = moduleRef.get(ReportBuilderService);
  });

  it('includes the match category in the heading', () => {
    categoryLabel.label.mockReturnValue('Cup Final');
    const html = service.build(reportWith({ category: 'cup_final' }));

    expect(html).toContain('Round 3 [Cup Final]');
  });

  it('includes the category for a normal match too', () => {
    categoryLabel.label.mockReturnValue('Normal');
    const html = service.build(reportWith({ category: 'normal' }));

    expect(html).toContain('[Normal]');
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

  it('renders a score and winner block for a decided match', () => {
    const html = service.build({
      ...report,
      matches: [
        {
          match,
          panels: [],
          result: {
            teams: [
              { matchTeamId: 11, teamName: 'Sewerton Scavengers', score: 2 },
              { matchTeamId: 12, teamName: 'Vorgash New Order', score: 1 },
            ],
            winningMatchTeamId: 11,
          },
        },
      ],
    });

    expect(html).toContain(
      '<p class="result">Sewerton Scavengers 2 &#8211; Vorgash New Order 1 ' +
        '&#8212; Winner: Sewerton Scavengers</p>',
    );
  });

  it('renders "Draw" when no team won', () => {
    const html = service.build({
      ...report,
      matches: [
        {
          match,
          panels: [],
          result: {
            teams: [
              { matchTeamId: 11, teamName: 'Sewerton Scavengers', score: 1 },
              { matchTeamId: 12, teamName: 'Vorgash New Order', score: 1 },
            ],
            winningMatchTeamId: null,
          },
        },
      ],
    });

    expect(html).toContain('&#8212; Draw</p>');
  });

  it('notes when a match has no result data at all', () => {
    const html = service.build({
      ...report,
      matches: [{ match, panels: [] }],
    });

    expect(html).toContain('No score or outcome recorded.');
  });

  it('keeps the result out of the heading', () => {
    const html = service.build({
      ...report,
      matches: [
        {
          match,
          panels: [],
          result: {
            teams: [
              { matchTeamId: 11, teamName: 'Sewerton Scavengers', score: 2 },
              { matchTeamId: 12, teamName: 'Vorgash New Order', score: 1 },
            ],
            winningMatchTeamId: 11,
          },
        },
      ],
    });

    expect(html).toMatch(/<h2>[^<]*<\/h2>\s*<p class="result">/);
  });
});
