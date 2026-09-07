import {
  HtmlService,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import { PLAYER_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { PlayerSamplerService } from './player-sampler.service';
import { ReportBuilderService } from './report-builder.service';
import { ReviewService } from './review.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Janhorgh',
  teamName: 'Bockar',
  positionName: 'Lineman',
  eraName: 'Third Era',
  selectedFor: ['Random sample'],
};

describe('ReviewService', () => {
  let service: ReviewService;
  let builder: MockProxy<ReportBuilderService>;

  beforeEach(async () => {
    const sampler = mock<PlayerSamplerService>();
    sampler.sample.mockResolvedValue({ items: [player], gaps: [] });
    const reviewer = mock<PlayerDataTypeReviewer>();
    Object.assign(reviewer, { id: 'player-info' });
    reviewer.getRawSource.mockResolvedValue('<p>raw</p>');
    reviewer.getImportedView.mockResolvedValue('<p>db</p>');
    builder = mock<ReportBuilderService>();
    builder.build.mockReturnValue('<html></html>');
    const writer = mock<ReportWriterService>();
    writer.write.mockResolvedValue('/tmp/report-2026-08-12T10-00-00Z.html');
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: PlayerSamplerService, useValue: sampler },
        { provide: PLAYER_DATA_TYPE_REVIEWERS, useValue: [reviewer] },
        { provide: ReportBuilderService, useValue: builder },
        { provide: ReportWriterService, useValue: writer },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(ReviewService);
  });

  it('reports each sampled player unchanged', async () => {
    await service.run();

    expect(builder.build.mock.calls[0][0].items.map((e) => e.item)).toEqual([
      player,
    ]);
  });

  it('runs the shared review loop end to end', async () => {
    await expect(service.run()).resolves.toEqual({
      reportPath: '/tmp/report-2026-08-12T10-00-00Z.html',
      itemCount: 1,
      gaps: [],
    });
  });
});
