import type { StarPlayerHireCount } from '@blood-bowl-tracker/game-data';
import { StarPlayersService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  STAR_PLAYER_TOPLIST_NO_DATA_MESSAGE,
  STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { StarPlayerToplistService } from './star-player-toplist.service';

interface MadeService {
  service: StarPlayerToplistService;
  leaderboard: MockProxy<LeaderboardService>;
}

// Built per test rather than in a beforeEach: `starPlayers` is an *input* to
// construction here (each case seeds a different canned query result), which
// is the case CLAUDE.md points at the makeService-factory idiom for.
async function makeService(
  starPlayers: StarPlayersService,
): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerToplistService,
      { provide: StarPlayersService, useValue: starPlayers },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(StarPlayerToplistService), leaderboard };
}

const rows: StarPlayerHireCount[] = [
  { positionId: 21, name: 'Morg n Thorg', count: 7 },
  { positionId: 20, name: 'Griff Oberwald', count: 3 },
];

describe('StarPlayerToplistService.resolveTotalHires', () => {
  // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
  // rendering, the timeout fallback) is covered by leaderboard.service.spec.ts.
  // `leaderboard` is a mock returning canned values here, so these tests only
  // assert what StarPlayerToplistService itself owns.
  it('wires the embed title and per-row deepdive button id', async () => {
    const starPlayers = mock<StarPlayersService>();
    starPlayers.countTotalHires.mockResolvedValue(rows);
    const { service, leaderboard } = await makeService(starPlayers);
    const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
    leaderboard.resolveToplist.mockResolvedValueOnce(canned);

    const result = await service.resolveTotalHires();

    expect(result).toBe(canned);
    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<StarPlayerHireCount>;
    expect(options.title).toBe('Star players by times hired');
    expect(options.entityLink?.customIdPrefix).toBe(
      STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
    );
    expect(options.entityLink?.entityId(rows[0])).toBe(rows[0].positionId);
  });

  it('fetches the star hire counts with the shared toplist limit', async () => {
    const starPlayers = mock<StarPlayersService>();
    starPlayers.countTotalHires.mockResolvedValue(rows);
    const { service, leaderboard } = await makeService(starPlayers);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });

    await service.resolveTotalHires();

    expect(starPlayers.countTotalHires).toHaveBeenCalledWith(
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('leaves row formatting to the leaderboard default', async () => {
    const starPlayers = mock<StarPlayersService>();
    starPlayers.countTotalHires.mockResolvedValue(rows);
    const { service, leaderboard } = await makeService(starPlayers);
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');

    await service.resolveTotalHires();

    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<StarPlayerHireCount>;
    expect(options.formatRow).toBeUndefined();
  });

  it('configures the toplist-specific timeout and empty-state messages', async () => {
    const starPlayers = mock<StarPlayersService>();
    starPlayers.countTotalHires.mockResolvedValue(rows);
    const { service, leaderboard } = await makeService(starPlayers);
    leaderboard.resolveToplist.mockResolvedValueOnce(
      STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    );

    const result = await service.resolveTotalHires();

    expect(result).toBe(STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE);
    expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMessage: STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE,
        noDataMessage: STAR_PLAYER_TOPLIST_NO_DATA_MESSAGE,
      }),
    );
  });
});
