import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  FACT_SCOPE_ALL_TIME,
  PositionsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { POSITION_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  POSITION_TOPLIST_NO_DATA_MESSAGE,
  POSITION_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { PositionToplistService } from './position-toplist.service';

interface PositionRow {
  positionId: number;
  name: string;
  raceName: string;
  count: number;
}

const rows: PositionRow[] = [
  { positionId: 1, name: 'Lineman', raceName: 'Orc', count: 120 },
  { positionId: 2, name: 'Lineman', raceName: 'Human', count: 90 },
];

interface MadeService {
  service: PositionToplistService;
  leaderboard: MockProxy<LeaderboardService>;
}

// A per-test factory rather than a beforeEach subject: each test seeds the
// PositionsService mock with the rows it cares about before the service is
// built, which is the case CLAUDE.md's testing guidance calls the factory
// idiom out for.
async function makeService(
  positions: MockProxy<PositionsService> = mock<PositionsService>(),
): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionToplistService,
      { provide: PositionsService, useValue: positions },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(PositionToplistService), leaderboard };
}

function capturedOptions(
  leaderboard: MockProxy<LeaderboardService>,
): ResolveToplistOptions<PositionRow & { rank: number }> {
  return leaderboard.resolveToplist.mock
    .calls[0][0] as unknown as ResolveToplistOptions<
    PositionRow & { rank: number }
  >;
}

describe('PositionToplistService.resolvePlayers', () => {
  // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
  // rendering) is covered by leaderboard.service.spec.ts; here it is a mock
  // returning a canned reply, so these tests assert only what
  // PositionToplistService owns: the title, the messages, the deepdive link
  // and the row format.
  it('wires the embed title and per-row deepdive button id', async () => {
    const positions = mock<PositionsService>();
    positions.countPlayersByPosition.mockResolvedValue(rows);
    const { service, leaderboard } = await makeService(positions);
    const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
    leaderboard.resolveToplist.mockResolvedValueOnce(canned);

    const result = await service.resolvePlayers(FACT_SCOPE_ALL_TIME);

    expect(result).toBe(canned);
    const options = capturedOptions(leaderboard);
    expect(options.title).toBe('Positions by players');
    expect(options.entityLink?.customIdPrefix).toBe(
      POSITION_BUTTON_CUSTOM_ID_PREFIX,
    );
    expect(options.entityLink?.entityId({ ...rows[0], rank: 1 })).toBe(1);
  });

  it('labels the drill-down button/select entry with the race, so same-named positions stay distinguishable', async () => {
    const positions = mock<PositionsService>();
    positions.countPlayersByPosition.mockResolvedValue(rows);
    const { service, leaderboard } = await makeService(positions);
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');

    await service.resolvePlayers(FACT_SCOPE_ALL_TIME);

    const options = capturedOptions(leaderboard);
    expect(options.entityLink?.label?.({ ...rows[0], rank: 1 })).toBe(
      'Lineman (Orc)',
    );
    expect(options.entityLink?.label?.({ ...rows[1], rank: 2 })).toBe(
      'Lineman (Human)',
    );
  });

  it('renders each row as "<rank>. <name> (<race>) — <count>"', async () => {
    const positions = mock<PositionsService>();
    positions.countPlayersByPosition.mockResolvedValue(rows);
    const { service, leaderboard } = await makeService(positions);
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');

    await service.resolvePlayers(FACT_SCOPE_ALL_TIME);

    const options = capturedOptions(leaderboard);
    expect(options.formatRow?.({ ...rows[0], rank: 1 })).toBe(
      '1. Lineman (Orc) — 120',
    );
    expect(options.formatRow?.({ ...rows[1], rank: 2 })).toBe(
      '2. Lineman (Human) — 90',
    );
  });

  it('passes the scope and the fetch limit through to the query', async () => {
    const positions = mock<PositionsService>();
    positions.countPlayersByPosition.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(positions);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });

    const scope: FactScope = { eraId: 20 };
    await service.resolvePlayers(scope);

    expect(positions.countPlayersByPosition).toHaveBeenCalledWith(
      { eraId: 20 },
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('configures the toplist-specific messages and returns the timeout one verbatim', async () => {
    const positions = mock<PositionsService>();
    positions.countPlayersByPosition.mockResolvedValue(rows);
    const { service, leaderboard } = await makeService(positions);
    leaderboard.resolveToplist.mockResolvedValueOnce(
      POSITION_TOPLIST_TIMEOUT_MESSAGE,
    );

    const result = await service.resolvePlayers(FACT_SCOPE_ALL_TIME);

    expect(result).toBe(POSITION_TOPLIST_TIMEOUT_MESSAGE);
    expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMessage: POSITION_TOPLIST_TIMEOUT_MESSAGE,
        noDataMessage: POSITION_TOPLIST_NO_DATA_MESSAGE,
      }),
    );
  });
});
