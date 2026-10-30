import type { KnownUnspentSpp } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { NumberFormatterService } from '../../shared/number-formatter.service';
import { PlayerSppSectionService } from './player-spp-section.service';
import { UnspentSppLineService } from './unspent-spp-line.service';

const covers: KnownUnspentSpp = {
  status: 'known',
  totalSpp: 12,
  advancementsGained: 1,
  spentMin: 6,
  spentMax: 6,
  unspentMin: 6,
  unspentMax: 6,
  cheapestNextCost: 6,
  coversAnother: 'yes',
  storedVerdict: 'none_stored',
};

describe('PlayerSppSectionService', () => {
  let service: PlayerSppSectionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      // A pure chain end to end (CLAUDE.md's pure-chain carve-out): every
      // link is passed real so the specs assert the actual rendered lines.
      providers: [
        PlayerSppSectionService,
        UnspentSppLineService,
        NumberFormatterService,
      ],
    }).compile();
    service = moduleRef.get(PlayerSppSectionService);
  });

  it('is empty when no total is computed, even with an adjustment and unspent result', () => {
    expect(
      service.build({ sppTotal: null, sppAdjustment: 2, unspent: covers }),
    ).toEqual([]);
  });

  it('shows the total alone after a blank line when there is no adjustment', () => {
    expect(
      service.build({ sppTotal: 12, sppAdjustment: null, unspent: undefined }),
    ).toEqual(['', 'Total SPP: 12']);
  });

  it('treats a zero adjustment as no adjustment', () => {
    expect(
      service.build({ sppTotal: 12, sppAdjustment: 0, unspent: undefined }),
    ).toEqual(['', 'Total SPP: 12']);
  });

  it('shows a positive adjustment with an explicit plus sign', () => {
    expect(
      service.build({
        sppTotal: 1234,
        sppAdjustment: 1500,
        unspent: undefined,
      }),
    ).toEqual(['', 'SPP adjustment: +1,500 (included)', 'Total SPP: 1,234']);
  });

  it('shows a negative adjustment with its own minus sign', () => {
    expect(
      service.build({ sppTotal: 8, sppAdjustment: -3, unspent: undefined }),
    ).toEqual(['', 'SPP adjustment: -3 (included)', 'Total SPP: 8']);
  });

  it('shows a computed total of zero', () => {
    expect(
      service.build({ sppTotal: 0, sppAdjustment: null, unspent: undefined }),
    ).toEqual(['', 'Total SPP: 0']);
  });

  it('puts the unspent line directly under the total', () => {
    expect(
      service.build({ sppTotal: 12, sppAdjustment: 2, unspent: covers }),
    ).toEqual([
      '',
      'SPP adjustment: +2 (included)',
      'Total SPP: 12',
      'Unspent SPP: 6 (covers another advancement)',
    ]);
  });

  it('shows a timed-out unspent lookup as unknown', () => {
    expect(
      service.build({ sppTotal: 12, sppAdjustment: null, unspent: null }),
    ).toEqual([
      '',
      'Total SPP: 12',
      'Unspent SPP: unknown (lookup unavailable)',
    ]);
  });
});
