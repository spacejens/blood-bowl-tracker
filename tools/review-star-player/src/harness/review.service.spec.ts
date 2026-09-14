import {
  HtmlService,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { StarPlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import { STAR_PLAYER_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import type { SampledStarPlayer } from '../shared/review.types';
import { ReportBuilderService } from './report-builder.service';
import { ReviewService } from './review.service';
import { StarPlayerSamplerService } from './star-player-sampler.service';

const star: SampledStarPlayer = {
  positionId: 7,
  positionName: 'Griff Oberwald',
  selectedFor: ['Random sample'],
};

async function makeService(options: {
  reviewers?: StarPlayerDataTypeReviewer[];
}): Promise<{
  service: ReviewService;
  builder: MockProxy<ReportBuilderService>;
}> {
  const sampler = mock<StarPlayerSamplerService>();
  sampler.sample.mockResolvedValue({ items: [star], gaps: [] });
  const builder = mock<ReportBuilderService>();
  builder.build.mockReturnValue('<html></html>');
  const writer = mock<ReportWriterService>();
  writer.write.mockResolvedValue('/tmp/report-2026-08-26T09-00-00Z.html');
  const moduleRef = await Test.createTestingModule({
    providers: [
      ReviewService,
      { provide: StarPlayerSamplerService, useValue: sampler },
      {
        provide: STAR_PLAYER_DATA_TYPE_REVIEWERS,
        useValue: options.reviewers ?? [],
      },
      { provide: ReportBuilderService, useValue: builder },
      { provide: ReportWriterService, useValue: writer },
      HtmlService,
    ],
  }).compile();
  return { service: moduleRef.get(ReviewService), builder };
}

describe('ReviewService', () => {
  it('reports each sampled star unchanged', async () => {
    const { service, builder } = await makeService({});

    await service.run();

    expect(builder.build.mock.calls[0][0].items.map((e) => e.item)).toEqual([
      star,
    ]);
  });

  it('runs the shared review loop end to end', async () => {
    const { service } = await makeService({});

    await expect(service.run()).resolves.toEqual({
      reportPath: '/tmp/report-2026-08-26T09-00-00Z.html',
      itemCount: 1,
      gaps: [],
    });
  });

  it('turns a reviewer failure into an inline note rather than failing the run', async () => {
    const reviewer = mock<StarPlayerDataTypeReviewer>();
    Object.defineProperty(reviewer, 'id', { value: 'broken-reviewer' });
    reviewer.getRawSource.mockRejectedValue(new Error('boom'));
    reviewer.getImportedView.mockResolvedValue('<p>imported</p>');
    const { service, builder } = await makeService({ reviewers: [reviewer] });

    await service.run();

    const panels = builder.build.mock.calls[0][0].items[0].panels;
    expect(panels[0].rawHtml).toContain('Rendering failed: boom');
    expect(panels[0].importedHtml).toBe('<p>imported</p>');
  });
});
