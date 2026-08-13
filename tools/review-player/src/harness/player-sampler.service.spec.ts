import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import type { PlayerStratifier } from '../shared/player-stratifier';
import { PLAYER_STRATIFIERS } from '../shared/player-stratifier';
import type { ReviewPlayer } from '../shared/review.types';
import { PlayerLookupService } from './player-lookup.service';
import { PlayerSamplerService } from './player-sampler.service';

function reviewPlayer(overrides: Partial<ReviewPlayer> = {}): ReviewPlayer {
  return {
    source: 'bbl',
    playerId: 42,
    externalId: '1000',
    playerName: 'Janhorgh',
    teamName: 'Bockar',
    positionName: 'Lineman',
    eraName: 'Third Era',
    ...overrides,
  };
}

async function makeService(options: {
  stratifier?: MockProxy<PlayerStratifier>;
  lookup?: MockProxy<PlayerLookupService>;
  config?: MockProxy<ReviewPlayerConfigService>;
}): Promise<PlayerSamplerService> {
  const stratifier =
    options.stratifier ??
    (() => {
      const created = mock<PlayerStratifier>();
      created.listStrata.mockReturnValue([]);
      return created;
    })();
  const lookup = options.lookup ?? mock<PlayerLookupService>();
  const config = options.config ?? mock<ReviewPlayerConfigService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerSamplerService,
      { provide: PLAYER_STRATIFIERS, useValue: [stratifier] },
      { provide: PlayerLookupService, useValue: lookup },
      { provide: ReviewPlayerConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(PlayerSamplerService);
}

describe('PlayerSamplerService', () => {
  it('samples every stratum for every source it applies to', async () => {
    const stratifier = mock<PlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl', 'tp'] },
    ]);
    stratifier.sampleStratum.mockImplementation(({ source }) =>
      Promise.resolve([
        reviewPlayer({ source, playerId: source === 'bbl' ? 42 : 43 }),
      ]),
    );
    const config = mock<ReviewPlayerConfigService>();
    config.getPlayersPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { players, gaps } = await service.sample();

    expect(players.map((player) => player.playerId)).toEqual([42, 43]);
    expect(players[0].selectedFor).toEqual(['Random sample']);
    expect(gaps).toEqual([]);
    expect(stratifier.sampleStratum).toHaveBeenCalledWith({
      source: 'bbl',
      stratumId: 'random',
      limit: 3,
    });
  });

  it('records a gap for a stratum that produced nothing', async () => {
    const stratifier = mock<PlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([]);
    const config = mock<ReviewPlayerConfigService>();
    config.getPlayersPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { gaps } = await service.sample();

    expect(gaps).toEqual([
      { source: 'bbl', reason: 'No player found for stratum "Random sample"' },
    ]);
  });

  it('merges the reasons a player was picked more than once', async () => {
    const stratifier = mock<PlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
      { id: 'spp-discrepancy', label: 'SPP totals disagree', sources: ['bbl'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([reviewPlayer()]);
    const config = mock<ReviewPlayerConfigService>();
    config.getPlayersPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { players } = await service.sample();

    expect(players).toHaveLength(1);
    expect(players[0].selectedFor).toEqual([
      'Random sample',
      'SPP totals disagree',
    ]);
  });

  it('always includes configured overrides and dedups them against the strata', async () => {
    const stratifier = mock<PlayerStratifier>();
    stratifier.listStrata.mockReturnValue([]);
    const lookup = mock<PlayerLookupService>();
    lookup.findByExternalIds.mockResolvedValue([reviewPlayer()]);
    const config = mock<ReviewPlayerConfigService>();
    config.getPlayersPerStratum.mockReturnValue(3);
    config.getOverrides.mockImplementation((source) =>
      source === 'bbl' ? ['1000'] : [],
    );
    const service = await makeService({ stratifier, lookup, config });

    const { players } = await service.sample();

    expect(players[0].selectedFor).toEqual(['override']);
  });

  it('orders players by source, then name, then id', async () => {
    const stratifier = mock<PlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl', 'tp'] },
    ]);
    stratifier.sampleStratum.mockImplementation(({ source }) =>
      Promise.resolve(
        source === 'bbl'
          ? [
              reviewPlayer({ playerId: 5, playerName: 'Beta' }),
              reviewPlayer({ playerId: 2, playerName: 'Beta' }),
              reviewPlayer({ playerId: 9, playerName: 'Alpha' }),
            ]
          : [reviewPlayer({ source: 'tp', playerId: 1, playerName: 'Zoe' })],
      ),
    );
    const config = mock<ReviewPlayerConfigService>();
    config.getPlayersPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { players } = await service.sample();

    expect(
      players.map((player) => [
        player.source,
        player.playerName,
        player.playerId,
      ]),
    ).toEqual([
      ['bbl', 'Alpha', 9],
      ['bbl', 'Beta', 2],
      ['bbl', 'Beta', 5],
      ['tp', 'Zoe', 1],
    ]);
  });

  it('records a gap for an override that is not in the database', async () => {
    const stratifier = mock<PlayerStratifier>();
    stratifier.listStrata.mockReturnValue([]);
    const lookup = mock<PlayerLookupService>();
    lookup.findByExternalIds.mockResolvedValue([]);
    const config = mock<ReviewPlayerConfigService>();
    config.getPlayersPerStratum.mockReturnValue(3);
    config.getOverrides.mockImplementation((source) =>
      source === 'tp' ? ['9999999'] : [],
    );
    const service = await makeService({ stratifier, lookup, config });

    const { gaps } = await service.sample();

    expect(gaps).toEqual([
      {
        source: 'tp',
        reason: 'Override player "9999999" was not found in the database',
      },
    ]);
  });
});
