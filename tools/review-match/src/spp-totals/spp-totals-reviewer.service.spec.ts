import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledMatch } from '../shared/review.types';
import { SppComputedRendererService } from './spp-computed-renderer.service';
import { SppImportedRendererService } from './spp-imported-renderer.service';
import type { PlayerSppRow } from './spp-totals-lookup.service';
import { SppTotalsLookupService } from './spp-totals-lookup.service';
import { SppTotalsReviewerService } from './spp-totals-reviewer.service';

const match: SampledMatch = {
  source: 'tp',
  matchId: 12,
  externalId: '576223',
  matchName: 'Round 1',
  competitionName: 'Säsong 30',
  playedAt: new Date('2026-02-09T21:00:00.000Z'),
  category: 'normal',
  selectedFor: ['SPP discrepancy'],
};

const rows: PlayerSppRow[] = [
  {
    playerId: 7,
    playerName: 'Betong Bengt',
    teamName: 'Bockar',
    matchTotal: 3,
    computedTotal: 16,
    sppTotal: 20,
    sppAdjustment: 0,
    mismatch: true,
  },
];

describe('SppTotalsReviewerService', () => {
  let service: SppTotalsReviewerService;
  let lookup: MockProxy<SppTotalsLookupService>;
  let computed: MockProxy<SppComputedRendererService>;
  let imported: MockProxy<SppImportedRendererService>;

  beforeEach(async () => {
    lookup = mock<SppTotalsLookupService>();
    computed = mock<SppComputedRendererService>();
    imported = mock<SppImportedRendererService>();
    lookup.load.mockResolvedValue(rows);
    computed.render.mockReturnValue('<table>computed</table>');
    imported.render.mockReturnValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        SppTotalsReviewerService,
        { provide: SppTotalsLookupService, useValue: lookup },
        { provide: SppComputedRendererService, useValue: computed },
        { provide: SppImportedRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(SppTotalsReviewerService);
  });

  it('identifies itself as the spp-totals data type with its own panel labels', () => {
    expect(service.id).toBe('spp-totals');
    expect(service.rawPanelLabel).toBe('Computed from match events (database)');
    expect(service.importedPanelLabel).toBe('Stored player totals (database)');
  });

  it('renders the computed panel from the looked-up rows', async () => {
    expect(await service.getRawSource(match)).toBe('<table>computed</table>');
    expect(lookup.load).toHaveBeenCalledWith(match);
    expect(computed.render).toHaveBeenCalledWith(rows);
  });

  it('renders the imported panel from the looked-up rows', async () => {
    expect(await service.getImportedView(match)).toBe(
      '<table>imported</table>',
    );
    expect(imported.render).toHaveBeenCalledWith(rows);
  });
});
