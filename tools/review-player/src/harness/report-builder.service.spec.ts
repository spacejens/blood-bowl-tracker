import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { HtmlService } from '../shared/html.service';
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

async function makeService(): Promise<ReportBuilderService> {
  const moduleRef = await Test.createTestingModule({
    providers: [ReportBuilderService, HtmlService],
  }).compile();
  return moduleRef.get(ReportBuilderService);
}

describe('ReportBuilderService', () => {
  it('heads each player section with their identity and why they were picked', async () => {
    const service = await makeService();

    const html = service.build({
      players: [
        {
          player,
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

  it("uses a panel pair's own labels when the reviewer supplied them", async () => {
    const service = await makeService();

    const html = service.build({
      players: [
        {
          player,
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

  it('lists gaps when there are any', async () => {
    const service = await makeService();

    const html = service.build({
      players: [],
      gaps: [
        { source: 'tp', reason: 'No player found for stratum "Random sample"' },
      ],
      generatedAt,
    });

    expect(html).toContain('<h2>Gaps</h2>');
    expect(html).toContain(
      'No player found for stratum &quot;Random sample&quot;',
    );
  });

  it('says so when no player was sampled at all', async () => {
    const service = await makeService();

    const html = service.build({ players: [], gaps: [], generatedAt });

    expect(html).toContain('<p class="note">No players were sampled.</p>');
    expect(html).toContain(
      'No gaps: every stratum and override produced at least one player.',
    );
  });
});
