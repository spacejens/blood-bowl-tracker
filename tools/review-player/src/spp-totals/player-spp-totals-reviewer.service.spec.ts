import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import { PlayerSppComputedRendererService } from './player-spp-computed-renderer.service';
import { PlayerSppImportedRendererService } from './player-spp-imported-renderer.service';
import type { PlayerSppTotals } from './player-spp-lookup.service';
import { PlayerSppLookupService } from './player-spp-lookup.service';
import { PlayerSppTotalsReviewerService } from './player-spp-totals-reviewer.service';

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

const totals: PlayerSppTotals = {
  computedTotal: 16,
  eventCount: 5,
  sppTotal: 20,
  sppAdjustment: 0,
  mismatch: true,
};

describe('PlayerSppTotalsReviewerService', () => {
  let service: PlayerSppTotalsReviewerService;
  let lookup: MockProxy<PlayerSppLookupService>;
  let computed: MockProxy<PlayerSppComputedRendererService>;
  let imported: MockProxy<PlayerSppImportedRendererService>;

  beforeEach(async () => {
    lookup = mock<PlayerSppLookupService>();
    computed = mock<PlayerSppComputedRendererService>();
    imported = mock<PlayerSppImportedRendererService>();
    lookup.load.mockResolvedValue(totals);
    computed.render.mockReturnValue('<table>computed</table>');
    imported.render.mockReturnValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerSppTotalsReviewerService,
        { provide: PlayerSppLookupService, useValue: lookup },
        { provide: PlayerSppComputedRendererService, useValue: computed },
        { provide: PlayerSppImportedRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(PlayerSppTotalsReviewerService);
  });

  it('identifies itself as the spp-totals data type with its own panel labels', () => {
    expect(service.id).toBe('spp-totals');
    expect(service.rawPanelLabel).toBe('Computed from match events (database)');
    expect(service.importedPanelLabel).toBe('Stored player totals (database)');
  });

  it('renders the computed panel from the looked-up totals', async () => {
    expect(await service.getRawSource(player)).toBe('<table>computed</table>');
    expect(lookup.load).toHaveBeenCalledWith(player);
    expect(computed.render).toHaveBeenCalledWith(totals);
  });

  it('renders the imported panel from the looked-up totals', async () => {
    expect(await service.getImportedView(player)).toBe(
      '<table>imported</table>',
    );
    expect(lookup.load).toHaveBeenCalledWith(player);
    expect(imported.render).toHaveBeenCalledWith(totals);
  });
});
