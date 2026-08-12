import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { HtmlService } from '../shared/html.service';
import { SppImportedRendererService } from './spp-imported-renderer.service';
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

async function makeService(): Promise<SppImportedRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SppImportedRendererService, HtmlService],
  }).compile();
  return moduleRef.get(SppImportedRendererService);
}

describe('SppImportedRendererService', () => {
  it('renders the stored total and adjustment', async () => {
    const service = await makeService();

    const html = service.render([row({ sppTotal: 16, sppAdjustment: 2 })]);

    expect(html).toContain('<th>spp_total</th>');
    expect(html).toContain('<th>spp_adjustment</th>');
    expect(html).toContain('<td>16</td>');
    expect(html).toContain('<td>2</td>');
  });

  it('renders a missing stored total as an em dash and flags it', async () => {
    const service = await makeService();

    const html = service.render([
      row({ sppTotal: null, sppAdjustment: null, mismatch: true }),
    ]);

    expect(html).toContain('<tr class="mismatch">');
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('<td>MISMATCH</td>');
  });

  it('notes when no player is in scope for the match', async () => {
    const service = await makeService();

    expect(service.render([])).toBe(
      '<p class="note">No players in scope for this match.</p>',
    );
  });
});
