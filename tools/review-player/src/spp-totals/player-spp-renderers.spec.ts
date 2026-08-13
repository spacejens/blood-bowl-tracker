import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PlayerSppComputedRendererService } from './player-spp-computed-renderer.service';
import { PlayerSppImportedRendererService } from './player-spp-imported-renderer.service';
import type { PlayerSppTotals } from './player-spp-lookup.service';

function totals(overrides: Partial<PlayerSppTotals> = {}): PlayerSppTotals {
  return {
    computedTotal: 16,
    eventCount: 5,
    sppTotal: 16,
    sppAdjustment: 0,
    mismatch: false,
    nonStandardEvents: [],
    ...overrides,
  };
}

async function makeServices(): Promise<{
  computed: PlayerSppComputedRendererService;
  imported: PlayerSppImportedRendererService;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerSppComputedRendererService,
      PlayerSppImportedRendererService,
      HtmlService,
    ],
  }).compile();
  return {
    computed: moduleRef.get(PlayerSppComputedRendererService),
    imported: moduleRef.get(PlayerSppImportedRendererService),
  };
}

describe('PlayerSppComputedRendererService', () => {
  it('renders the event-derived total and the events behind it', async () => {
    const { computed } = await makeServices();

    const html = computed.render(totals());

    expect(html).toContain(
      '<td>Computed total (sum of match events)</td><td>16</td>',
    );
    expect(html).toContain('<td>SPP-earning events</td><td>5</td>');
  });

  it('highlights and labels a disagreement', async () => {
    const { computed } = await makeServices();

    const html = computed.render(totals({ mismatch: true, sppTotal: 20 }));

    expect(html).toContain('<tr class="mismatch">');
    expect(html).toContain('<td>MISMATCH</td>');
  });

  it('leaves an agreeing pair unmarked', async () => {
    const { computed } = await makeServices();

    expect(computed.render(totals())).not.toContain('MISMATCH');
  });

  it('renders no non-standard-events table when there are no such events', async () => {
    const { computed } = await makeServices();

    const html = computed.render(totals());

    expect(html).not.toContain('<th>Action type</th>');
  });

  it('renders a highlighted row per non-standard event', async () => {
    const { computed } = await makeServices();

    const html = computed.render(
      totals({
        nonStandardEvents: [
          { actionType: 'touchdown', recordedValue: 5, expectedValue: 3 },
        ],
      }),
    );

    expect(html).toContain('<th>Action type</th>');
    expect(html).toContain('<th>Recorded SPP</th>');
    expect(html).toContain('<th>Expected SPP</th>');
    expect(html.match(/<tr class="mismatch">/g)).toHaveLength(1);
    expect(html).toContain('<td>touchdown</td><td>5</td><td>3</td>');
  });
});

describe('PlayerSppImportedRendererService', () => {
  it('renders the stored total and adjustment', async () => {
    const { imported } = await makeServices();

    const html = imported.render(totals({ sppTotal: 16, sppAdjustment: 2 }));

    expect(html).toContain('<td>spp_total</td><td>16</td>');
    expect(html).toContain('<td>spp_adjustment</td><td>2</td>');
  });

  it('renders a missing stored total as an em dash and flags it', async () => {
    const { imported } = await makeServices();

    const html = imported.render(
      totals({ sppTotal: null, sppAdjustment: null, mismatch: true }),
    );

    expect(html).toContain('<td>spp_total</td><td>—</td>');
    expect(html).toContain('<tr class="mismatch">');
    expect(html).toContain('<td>MISMATCH</td>');
  });
});
