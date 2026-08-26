import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SampledPlayer } from '../shared/review.types';
import { ReportBuilderService } from './report-builder.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Janhorgh',
  teamName: 'Bull Whip Whippersnappers',
  positionName: 'Hobgoblin Linemen',
  eraName: 'Third Era',
  selectedFor: ['SPP totals disagree', 'override'],
};

const generatedAt = new Date('2026-08-12T10:00:00.000Z');

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ReportBuilderService, HtmlService],
    }).compile();
    service = moduleRef.get(ReportBuilderService);
  });

  it('heads each player section with their identity and why they were picked', () => {
    const html = service.build({
      items: [
        {
          item: player,
          panels: [
            {
              dataTypeId: 'player-info',
              rawHtml: '<p>raw</p>',
              importedHtml: '<p>db</p>',
            },
          ],
        },
      ],
      gaps: [],
      generatedAt,
    });

    expect(html).toContain(
      'BBL player 1000 — Janhorgh (Bull Whip Whippersnappers, Hobgoblin Linemen, Third Era, db id 42)',
    );
    expect(html).toContain('Selected for: SPP totals disagree, override');
    expect(html).toContain('<h3>player-info</h3>');
    expect(html).toContain('<h4>Raw source (BBL)</h4>');
    expect(html).toContain('<h4>Imported (database)</h4>');
    expect(html).toContain('<p>raw</p>');
  });

  it("uses a panel pair's own labels when the reviewer supplied them", () => {
    const html = service.build({
      items: [
        {
          item: player,
          panels: [
            {
              dataTypeId: 'spp-totals',
              rawHtml: '<p>raw</p>',
              importedHtml: '<p>db</p>',
              rawLabel: 'Computed from match events (database)',
              importedLabel: 'Stored player totals (database)',
            },
          ],
        },
      ],
      gaps: [],
      generatedAt,
    });

    expect(html).toContain('<h4>Computed from match events (database)</h4>');
    expect(html).toContain('<h4>Stored player totals (database)</h4>');
  });

  it('titles the document for player review', () => {
    const html = service.build({ items: [], gaps: [], generatedAt });

    expect(html).toContain('<title>Player import review</title>');
    expect(html).toContain('<p class="note">No players were sampled.</p>');
  });
});
