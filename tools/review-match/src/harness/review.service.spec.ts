import {
  HtmlService,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { DataTypeReviewer } from '../shared/data-type-reviewer';
import { DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import type { SampledMatch } from '../shared/review.types';
import { MatchResultLookupService } from './match-result-lookup.service';
import { MatchSamplerService } from './match-sampler.service';
import { ReportBuilderService } from './report-builder.service';
import { ReviewService } from './review.service';

const match: SampledMatch = {
  source: 'bbl',
  matchId: 11,
  externalId: '1830',
  matchName: 'Round 3',
  competitionName: 'Season 18',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
  category: 'normal',
  selectedFor: ['Contains a foul'],
};

describe('ReviewService', () => {
  let service: ReviewService;
  let builder: MockProxy<ReportBuilderService>;
  let resultLookup: MockProxy<MatchResultLookupService>;

  beforeEach(async () => {
    const sampler = mock<MatchSamplerService>();
    sampler.sample.mockResolvedValue({ items: [match], gaps: [] });
    const reviewer = mock<DataTypeReviewer>();
    Object.defineProperty(reviewer, 'id', { value: 'match-events' });
    reviewer.getRawSource.mockResolvedValue('<p>raw</p>');
    reviewer.getImportedView.mockResolvedValue('<p>imported</p>');
    builder = mock<ReportBuilderService>();
    builder.build.mockReturnValue('<html></html>');
    const writer = mock<ReportWriterService>();
    writer.write.mockResolvedValue('/tmp/report.html');
    resultLookup = mock<MatchResultLookupService>();
    resultLookup.findByMatchIds.mockResolvedValue(new Map());
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: MatchSamplerService, useValue: sampler },
        { provide: DATA_TYPE_REVIEWERS, useValue: [reviewer] },
        { provide: ReportBuilderService, useValue: builder },
        { provide: ReportWriterService, useValue: writer },
        HtmlService,
        { provide: MatchResultLookupService, useValue: resultLookup },
      ],
    }).compile();
    service = moduleRef.get(ReviewService);
  });

  it("attaches each sampled match's result, looked up in one batch", async () => {
    resultLookup.findByMatchIds.mockResolvedValue(
      new Map([[match.matchId, { teams: [], winningMatchTeamId: null }]]),
    );

    await service.run();

    expect(resultLookup.findByMatchIds).toHaveBeenCalledTimes(1);
    expect(resultLookup.findByMatchIds).toHaveBeenCalledWith([match.matchId]);
    expect(builder.build.mock.calls[0][0].items[0].item).toEqual({
      ...match,
      result: { teams: [], winningMatchTeamId: null },
    });
  });

  it('leaves the result undefined for a match with no result rows', async () => {
    await service.run();

    expect(builder.build.mock.calls[0][0].items[0].item.result).toBeUndefined();
  });

  it('runs the shared review loop end to end', async () => {
    await expect(service.run()).resolves.toEqual({
      reportPath: '/tmp/report.html',
      itemCount: 1,
      gaps: [],
    });
  });
});
