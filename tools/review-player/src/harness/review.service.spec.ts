import {
  HtmlService,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
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

interface Harness {
  service: ReviewService;
  builder: MockProxy<ReportBuilderService>;
  writer: MockProxy<ReportWriterService>;
}

async function makeService(
  reviewers: PlayerDataTypeReviewer[],
  players: SampledPlayer[] = [player],
): Promise<Harness> {
  const sampler = mock<PlayerSamplerService>();
  sampler.sample.mockResolvedValue({ players, gaps: [] });
  const builder = mock<ReportBuilderService>();
  builder.build.mockReturnValue('<html></html>');
  const writer = mock<ReportWriterService>();
  writer.write.mockResolvedValue('/tmp/report-2026-08-12T10-00-00Z.html');
  const moduleRef = await Test.createTestingModule({
    providers: [
      ReviewService,
      { provide: PlayerSamplerService, useValue: sampler },
      { provide: PLAYER_DATA_TYPE_REVIEWERS, useValue: reviewers },
      { provide: ReportBuilderService, useValue: builder },
      { provide: ReportWriterService, useValue: writer },
      HtmlService,
    ],
  }).compile();
  return { service: moduleRef.get(ReviewService), builder, writer };
}

function makeReviewer(): MockProxy<PlayerDataTypeReviewer> {
  const reviewer = mock<PlayerDataTypeReviewer>();
  Object.assign(reviewer, { id: 'player-info' });
  reviewer.getRawSource.mockResolvedValue('<p>raw</p>');
  reviewer.getImportedView.mockResolvedValue('<p>db</p>');
  return reviewer;
}

describe('ReviewService', () => {
  it('asks every reviewer for both panels of every sampled player', async () => {
    const reviewer = makeReviewer();
    const { service, builder, writer } = await makeService([reviewer]);

    const outcome = await service.run();

    expect(reviewer.getRawSource).toHaveBeenCalledWith(player);
    expect(reviewer.getImportedView).toHaveBeenCalledWith(player);
    expect(builder.build).toHaveBeenCalled();
    expect(writer.write).toHaveBeenCalled();
    expect(outcome).toEqual({
      reportPath: '/tmp/report-2026-08-12T10-00-00Z.html',
      playerCount: 1,
      gaps: [],
    });
  });

  it('turns a failing reviewer into an inline note instead of failing the run', async () => {
    const reviewer = makeReviewer();
    reviewer.getRawSource.mockRejectedValue(new Error('unreadable page'));
    const { service, builder } = await makeService([reviewer]);

    await service.run();

    const report = builder.build.mock.calls[0][0];
    expect(report.players[0].panels[0].rawHtml).toBe(
      '<p class="note">Rendering failed: unreadable page</p>',
    );
    expect(report.players[0].panels[0].importedHtml).toBe('<p>db</p>');
  });

  it('stringifies a non-Error rejection in the inline note', async () => {
    const reviewer = makeReviewer();
    reviewer.getRawSource.mockRejectedValue('boom');
    const { service, builder } = await makeService([reviewer]);

    await service.run();

    const report = builder.build.mock.calls[0][0];
    expect(report.players[0].panels[0].rawHtml).toBe(
      '<p class="note">Rendering failed: boom</p>',
    );
  });

  it("copies a reviewer's panel labels onto the panel", async () => {
    const reviewer = makeReviewer();
    Object.assign(reviewer, {
      rawPanelLabel: 'Computed from match events (database)',
      importedPanelLabel: 'Stored player totals (database)',
    });
    const { service, builder } = await makeService([reviewer]);

    await service.run();

    expect(builder.build.mock.calls[0][0].players[0].panels[0]).toMatchObject({
      rawLabel: 'Computed from match events (database)',
      importedLabel: 'Stored player totals (database)',
    });
  });
});
