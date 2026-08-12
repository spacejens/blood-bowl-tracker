import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { HtmlService } from '../shared/html.service';
import { SppComputedRendererService } from './spp-computed-renderer.service';
import type { PlayerSppRow } from './spp-totals-lookup.service';

function row(overrides: Partial<PlayerSppRow> = {}): PlayerSppRow {
  return {
    playerId: 7,
    playerName: 'Betong Bengt',
    teamName: 'Bockar',
    matchTotal: 3,
    computedTotal: 16,
    sppTotal: 16,
    sppAdjustment: 0,
    mismatch: false,
    ...overrides,
  };
}

async function makeService(): Promise<SppComputedRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SppComputedRendererService, HtmlService],
  }).compile();
  return moduleRef.get(SppComputedRendererService);
}

describe('SppComputedRendererService', () => {
  it('renders one row per player with both computed figures', async () => {
    const service = await makeService();

    const html = service.render([row()]);

    expect(html).toContain('<th>Player</th>');
    expect(html).toContain('<td>Betong Bengt</td>');
    expect(html).toContain('<td>3</td>');
    expect(html).toContain('<td>16</td>');
  });

  it('highlights and labels a mismatching row', async () => {
    const service = await makeService();

    const html = service.render([
      row({ computedTotal: 16, sppTotal: 20, mismatch: true }),
    ]);

    expect(html).toContain('<tr class="mismatch">');
    expect(html).toContain('<td>MISMATCH</td>');
  });

  it('leaves a matching row unhighlighted and unlabelled', async () => {
    const service = await makeService();

    const html = service.render([row()]);

    expect(html).not.toContain('class="mismatch"');
    expect(html).not.toContain('MISMATCH');
  });

  it('notes when no player is in scope for the match', async () => {
    const service = await makeService();

    const html = service.render([]);

    expect(html).toBe(
      '<p class="note">No players in scope for this match.</p>',
    );
  });
});
