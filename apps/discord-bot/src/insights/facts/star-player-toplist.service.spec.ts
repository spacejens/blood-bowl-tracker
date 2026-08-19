import type {
  StarPlayerDistinctTeamsHiredCount,
  StarPlayerHireCount,
} from '@blood-bowl-tracker/game-data';
import { StarPlayersService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_NO_DATA_MESSAGE,
  STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_TIMEOUT_MESSAGE,
  STAR_PLAYER_TOPLIST_NO_DATA_MESSAGE,
  STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';
import { StarPlayerToplistService } from './star-player-toplist.service';

const rows: StarPlayerHireCount[] = [
  { positionId: 21, name: 'Morg n Thorg', count: 7 },
  { positionId: 20, name: 'Griff Oberwald', count: 3 },
];

const distinctTeamRows: StarPlayerDistinctTeamsHiredCount[] = [
  { positionId: 21, name: 'Morg n Thorg', count: 5 },
  { positionId: 20, name: 'Griff Oberwald', count: 2 },
];

describe('StarPlayerToplistService.resolveTotalHires', () => {
  // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
  // rendering, the timeout fallback) is covered by leaderboard.service.spec.ts.
  // `leaderboard` is a mock returning canned values here, so these tests only
  // assert what StarPlayerToplistService itself owns.
  let service: StarPlayerToplistService;
  let starPlayers: MockProxy<StarPlayersService>;
  let leaderboard: MockProxy<LeaderboardService>;

  beforeEach(async () => {
    starPlayers = mock<StarPlayersService>();
    leaderboard = mock<LeaderboardService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerToplistService,
        { provide: StarPlayersService, useValue: starPlayers },
        { provide: LeaderboardService, useValue: leaderboard },
      ],
    }).compile();
    service = moduleRef.get(StarPlayerToplistService);
  });

  it('wires the embed title and per-row deepdive button id', async () => {
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

  it('fetches the star hire counts with whatever limit the leaderboard requests', async () => {
    const sentinelLimit = 3;
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(sentinelLimit);
      return 'canned';
    });

    await service.resolveTotalHires();

    expect(starPlayers.countTotalHires).toHaveBeenCalledWith(sentinelLimit);
  });

  it('leaves row formatting to the leaderboard default', async () => {
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');

    await service.resolveTotalHires();

    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<StarPlayerHireCount>;
    expect(options.formatRow).toBeUndefined();
  });

  it('configures the toplist-specific timeout and empty-state messages', async () => {
    leaderboard.resolveToplist.mockResolvedValueOnce(
      STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    );

    await service.resolveTotalHires();

    expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMessage: STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE,
        noDataMessage: STAR_PLAYER_TOPLIST_NO_DATA_MESSAGE,
      }),
    );
  });
});

describe('StarPlayerToplistService.resolveDistinctTeamsHired', () => {
  // As with resolveTotalHires above, `leaderboard` is a mock returning canned
  // values, so these tests assert only what StarPlayerToplistService owns.
  let service: StarPlayerToplistService;
  let starPlayers: MockProxy<StarPlayersService>;
  let leaderboard: MockProxy<LeaderboardService>;

  beforeEach(async () => {
    starPlayers = mock<StarPlayersService>();
    leaderboard = mock<LeaderboardService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerToplistService,
        { provide: StarPlayersService, useValue: starPlayers },
        { provide: LeaderboardService, useValue: leaderboard },
      ],
    }).compile();
    service = moduleRef.get(StarPlayerToplistService);
  });

  it('wires the embed title and per-row deepdive button id', async () => {
    const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
    leaderboard.resolveToplist.mockResolvedValueOnce(canned);

    const result = await service.resolveDistinctTeamsHired();

    expect(result).toBe(canned);
    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<StarPlayerDistinctTeamsHiredCount>;
    expect(options.title).toBe('Star players by distinct teams hired');
    expect(options.entityLink?.customIdPrefix).toBe(
      STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
    );
    expect(options.entityLink?.entityId(distinctTeamRows[0])).toBe(
      distinctTeamRows[0].positionId,
    );
  });

  it('fetches the distinct-team counts with whatever limit the leaderboard requests', async () => {
    const sentinelLimit = 3;
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(sentinelLimit);
      return 'canned';
    });

    await service.resolveDistinctTeamsHired();

    expect(starPlayers.countDistinctTeamsHired).toHaveBeenCalledWith(
      sentinelLimit,
    );
    expect(starPlayers.countTotalHires).not.toHaveBeenCalled();
  });

  it('leaves row formatting to the leaderboard default', async () => {
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');

    await service.resolveDistinctTeamsHired();

    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<StarPlayerDistinctTeamsHiredCount>;
    expect(options.formatRow).toBeUndefined();
  });

  it('configures its own timeout and empty-state messages, distinct from the total-hires toplist', async () => {
    leaderboard.resolveToplist.mockResolvedValueOnce(
      STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_TIMEOUT_MESSAGE,
    );

    await service.resolveDistinctTeamsHired();

    expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMessage: STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_TIMEOUT_MESSAGE,
        noDataMessage: STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_NO_DATA_MESSAGE,
      }),
    );
    expect(STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_TIMEOUT_MESSAGE).not.toBe(
      STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    );
    expect(STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_NO_DATA_MESSAGE).not.toBe(
      STAR_PLAYER_TOPLIST_NO_DATA_MESSAGE,
    );
  });
});
