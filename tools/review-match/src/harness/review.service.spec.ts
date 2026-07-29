import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { DataTypeReviewer } from '../shared/data-type-reviewer';
import { DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import { HtmlService } from '../shared/html.service';
import type { SampledMatch } from '../shared/review.types';
import { MatchResultLookupService } from './match-result-lookup.service';
import { MatchSamplerService } from './match-sampler.service';
import { ReportBuilderService } from './report-builder.service';
import { ReportWriterService } from './report-writer.service';
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

interface Harness {
  service: ReviewService;
  sampler: MockProxy<MatchSamplerService>;
  reviewer: MockProxy<DataTypeReviewer>;
  builder: MockProxy<ReportBuilderService>;
  writer: MockProxy<ReportWriterService>;
  resultLookup: MockProxy<MatchResultLookupService>;
}

async function makeHarness(): Promise<Harness> {
  const sampler = mock<MatchSamplerService>();
  sampler.sample.mockResolvedValue({ matches: [match], gaps: [] });
  const reviewer = mock<DataTypeReviewer>();
  Object.defineProperty(reviewer, 'id', { value: 'match-events' });
  reviewer.getRawSource.mockResolvedValue('<p>raw</p>');
  reviewer.getImportedView.mockResolvedValue('<p>imported</p>');
  const builder = mock<ReportBuilderService>();
  builder.build.mockReturnValue('<html></html>');
  const writer = mock<ReportWriterService>();
  writer.write.mockResolvedValue('/tmp/report.html');
  const resultLookup = mock<MatchResultLookupService>();
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
  return {
    service: moduleRef.get(ReviewService),
    sampler,
    reviewer,
    builder,
    writer,
    resultLookup,
  };
}

describe('ReviewService', () => {
  it('renders both panels of every reviewer for every sampled match', async () => {
    const { service, reviewer, builder } = await makeHarness();

    await service.run();

    expect(reviewer.getRawSource).toHaveBeenCalledWith(match);
    expect(reviewer.getImportedView).toHaveBeenCalledWith(match);
    const report = builder.build.mock.calls[0][0];
    expect(report.matches).toEqual([
      {
        match,
        panels: [
          {
            dataTypeId: 'match-events',
            rawHtml: '<p>raw</p>',
            importedHtml: '<p>imported</p>',
          },
        ],
      },
    ]);
  });

  it('writes the built document and reports where it landed', async () => {
    const { service, builder, writer } = await makeHarness();

    await expect(service.run()).resolves.toEqual({
      reportPath: '/tmp/report.html',
      matchCount: 1,
      gaps: [],
    });
    expect(writer.write).toHaveBeenCalledWith(
      '<html></html>',
      expect.any(Date),
    );
    expect(builder.build).toHaveBeenCalledTimes(1);
  });

  it('writes the document with the same generatedAt the report body shows', async () => {
    const { service, builder, writer } = await makeHarness();

    await service.run();

    const report = builder.build.mock.calls[0][0];
    expect(writer.write).toHaveBeenCalledWith(
      '<html></html>',
      report.generatedAt,
    );
  });

  it("passes the sampler's gaps through to the report and the outcome", async () => {
    const { service, sampler, builder } = await makeHarness();
    const gaps = [{ source: 'tp' as const, reason: 'nothing found' }];
    sampler.sample.mockResolvedValue({ matches: [], gaps });

    const outcome = await service.run();

    expect(outcome.gaps).toEqual(gaps);
    expect(builder.build.mock.calls[0][0].gaps).toEqual(gaps);
  });

  it('turns a failing panel into an inline note instead of aborting the run', async () => {
    const { service, reviewer, builder } = await makeHarness();
    reviewer.getRawSource.mockRejectedValue(new Error('disk on fire'));

    const outcome = await service.run();

    const report = builder.build.mock.calls[0][0];
    expect(report.matches[0].panels[0].rawHtml).toBe(
      '<p class="note">Rendering failed: disk on fire</p>',
    );
    expect(report.matches[0].panels[0].importedHtml).toBe('<p>imported</p>');
    expect(outcome.matchCount).toBe(1);
  });

  it('stringifies a non-Error rejection in the inline note', async () => {
    const { service, reviewer, builder } = await makeHarness();
    reviewer.getImportedView.mockRejectedValue('disk on fire');

    await service.run();

    const report = builder.build.mock.calls[0][0];
    expect(report.matches[0].panels[0].importedHtml).toBe(
      '<p class="note">Rendering failed: disk on fire</p>',
    );
  });

  it("passes each sampled match's result to the report builder", async () => {
    const { service, resultLookup, builder } = await makeHarness();
    resultLookup.findByMatchIds.mockResolvedValue(
      new Map([[match.matchId, { teams: [], winningMatchTeamId: null }]]),
    );

    await service.run();

    expect(resultLookup.findByMatchIds).toHaveBeenCalledWith([match.matchId]);
    expect(builder.build).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: [
          expect.objectContaining({
            result: { teams: [], winningMatchTeamId: null },
          }),
        ],
      }),
    );
  });
});
