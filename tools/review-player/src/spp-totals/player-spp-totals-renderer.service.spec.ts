import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PlayerSppTotals } from './player-spp-lookup.service';
import { PlayerSppTotalsRendererService } from './player-spp-totals-renderer.service';

function totals(overrides: Partial<PlayerSppTotals> = {}): PlayerSppTotals {
  return {
    computedTotal: 16,
    eventCount: 5,
    sppTotal: 18,
    sppAdjustment: 2,
    mismatch: false,
    nonStandardEvents: [],
    ...overrides,
  };
}

describe('PlayerSppTotalsRendererService', () => {
  let service: PlayerSppTotalsRendererService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerSppTotalsRendererService, HtmlService],
    }).compile();
    service = moduleRef.get(PlayerSppTotalsRendererService);
  });

  it('shows the stored and the computed figures in one table', () => {
    const html = service.render(totals());

    expect(html).toContain('<td>Stored total (spp_total)</td><td>18</td>');
    expect(html).toContain(
      '<td>Stored adjustment (spp_adjustment)</td><td>2</td>',
    );
    expect(html).toContain(
      '<td>Computed total (sum of match events)</td><td>16</td>',
    );
    expect(html).toContain('<td>SPP-earning events</td><td>5</td>');
    expect(html).toContain(
      '<td>Agrees with computed total plus adjustment</td><td>yes</td>',
    );
    expect(html).not.toContain('MISMATCH');
    expect(html).not.toContain('class="note"');
  });

  it('highlights and labels a disagreement in the verdict cell only', () => {
    const html = service.render(totals({ mismatch: true, sppTotal: 20 }));

    expect(html).toContain(
      '<tr class="mismatch"><td>Agrees with computed total plus adjustment</td>' +
        '<td class="mismatch-cell">MISMATCH</td></tr>',
    );
  });

  it('shows a missing stored total and adjustment as dashes', () => {
    const html = service.render(
      totals({ sppTotal: null, sppAdjustment: null, mismatch: true }),
    );

    expect(html).toContain('<td>Stored total (spp_total)</td><td>—</td>');
    expect(html).toContain(
      '<td>Stored adjustment (spp_adjustment)</td><td>—</td>',
    );
    expect(html).toContain('<td class="mismatch-cell">MISMATCH</td>');
  });

  it('renders no events table when every event has the standard award', () => {
    expect(service.render(totals())).not.toContain('<th>Action type</th>');
  });

  it('renders a highlighted row per non-standard event', () => {
    const html = service.render(
      totals({
        nonStandardEvents: [
          { actionType: 'touchdown', recordedValue: 5, expectedValue: 3 },
        ],
      }),
    );

    expect(html).toContain(
      '<th>Action type</th><th>Recorded SPP</th><th>Expected SPP</th>',
    );
    expect(html).toContain(
      '<td>touchdown</td><td class="mismatch-cell">5</td>' +
        '<td class="mismatch-cell">3</td>',
    );
  });
});
