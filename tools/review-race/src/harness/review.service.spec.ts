import {
  HtmlService,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import { RACE_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import type { SampledRace } from '../shared/review.types';
import { RaceSamplerService } from './race-sampler.service';
import { ReportBuilderService } from './report-builder.service';
import { ReviewService } from './review.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

interface Harness {
  service: ReviewService;
  builder: MockProxy<ReportBuilderService>;
}

async function makeService(): Promise<Harness> {
  const sampler = mock<RaceSamplerService>();
  sampler.sample.mockResolvedValue({ items: [race], gaps: [] });
  const builder = mock<ReportBuilderService>();
  builder.build.mockReturnValue('<html></html>');
  const writer = mock<ReportWriterService>();
  writer.write.mockResolvedValue('/tmp/report-2026-08-26T09-00-00Z.html');
  const moduleRef = await Test.createTestingModule({
    providers: [
      ReviewService,
      { provide: RaceSamplerService, useValue: sampler },
      {
        provide: RACE_DATA_TYPE_REVIEWERS,
        useValue: [] as RaceDataTypeReviewer[],
      },
      { provide: ReportBuilderService, useValue: builder },
      { provide: ReportWriterService, useValue: writer },
      HtmlService,
    ],
  }).compile();
  return { service: moduleRef.get(ReviewService), builder };
}

describe('ReviewService', () => {
  it('reports each sampled race unchanged', async () => {
    const { service, builder } = await makeService();

    await service.run();

    expect(builder.build.mock.calls[0][0].items.map((e) => e.item)).toEqual([
      race,
    ]);
  });

  it('runs the shared review loop end to end', async () => {
    const { service } = await makeService();

    await expect(service.run()).resolves.toEqual({
      reportPath: '/tmp/report-2026-08-26T09-00-00Z.html',
      itemCount: 1,
      gaps: [],
    });
  });
});
