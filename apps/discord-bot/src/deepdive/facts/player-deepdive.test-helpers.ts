import type {
  PlayerDeepdiveCategoryCounts,
  PlayerHonor,
  PlayerKillEntry,
  PlayerKillerInfo,
} from '@blood-bowl-tracker/game-data';
import {
  PlayerDeathService,
  PlayersService,
  StarPlayersService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { mockDatabaseTimeout } from '../../database-timeout-mock.test-helpers';
import { EntityComponentsService } from '../../entity-components.service';
import { nullEntityComponents } from '../../entity-components-mock.test-helpers';
import { PlayerRowButtonService } from '../player-row-button.service';
import { PlayerDeepdiveService } from './player-deepdive.service';
import { PlayerKillsSectionService } from './player-kills-section.service';
import { makePlayerRowButton } from './team-deepdive.test-helpers';

/**
 * Test-only helper. Do not import from production code.
 *
 * Shared fixtures and builders for `PlayerDeepdiveService` specs, split across
 * `player-deepdive.service.spec.ts` (header, honors, category counts, SPP
 * totals, and killer/Status line) and `player-deepdive-kills.service.spec.ts`
 * (the Kills section) to keep each file under the repo's 1000-line spec
 * ceiling — see `CLAUDE.md`'s "Maximum file size".
 *
 * `makeService` compiles `PlayerDeepdiveService` alongside the *real*
 * `PlayerKillsSectionService` (a documented exception — see `CLAUDE.md`'s
 * "Testing services"). Since `PlayerKillsSectionService` itself injects
 * `PlayerRowButtonService`, that same testing module must also supply
 * `PlayerRowButtonService` — as the mock below — or Nest fails to resolve the
 * real kills section's own dependency.
 */

export const griff = {
  id: 1,
  name: 'Griff Oberwald',
  teamName: 'Reikland Reavers',
  teamId: 11,
  raceName: 'Human',
  raceId: 4,
  positionName: 'Blitzer',
  eraName: 'Season 5',
  eraId: 7,
  sppTotal: null as number | null,
  sppAdjustment: null as number | null,
};

export const gougedEye = {
  teamId: 12,
  teamName: 'Gouged Eye',
  raceId: 5,
  raceName: 'Orc',
  coachId: 22,
  coachName: 'Grimly',
};

export const championsOfDeath = {
  teamId: 13,
  teamName: 'Champions of Death',
  raceId: 6,
  raceName: 'Undead',
  coachId: 23,
  coachName: 'Mortis',
};

/**
 * A `TrophyAwardsService` mock. Defaults to a player with no honors, so tests
 * about other parts of the embed are unaffected by the Honors section, which
 * is omitted entirely in that case. `count` defaults to the row count, so a
 * test only supplies it when exercising the overflow remainder.
 */
export function makeTrophyAwards(
  honors: PlayerHonor[] = [],
  count = honors.length,
): MockProxy<TrophyAwardsService> {
  const trophyAwards = mock<TrophyAwardsService>();
  trophyAwards.countByPlayer.mockResolvedValue(count);
  trophyAwards.listByPlayer.mockResolvedValue(honors);
  return trophyAwards;
}

/**
 * A `PlayerDeathService` mock. Defaults to a living player (`null`) with no
 * kills, so tests about other parts of the embed never see a Status line or a
 * Kills section.
 */
export function makePlayerDeath(
  killer: PlayerKillerInfo | null = null,
  kills: PlayerKillEntry[] = [],
  killsTotal = kills.length,
): MockProxy<PlayerDeathService> {
  const playerDeath = mock<PlayerDeathService>();
  playerDeath.getKillerInfo.mockResolvedValue(killer);
  playerDeath.countKillsInflicted.mockResolvedValue(killsTotal);
  playerDeath.getKillsInflicted.mockResolvedValue(kills);
  return playerDeath;
}

export interface MakeServiceOptions {
  players: PlayersService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  trophyAwards?: MockProxy<TrophyAwardsService>;
  playerDeath?: MockProxy<PlayerDeathService>;
  stars?: MockProxy<StarPlayersService>;
  playerRowButton?: MockProxy<PlayerRowButtonService>;
}

/**
 * A `StarPlayersService` mock. Defaults to `undefined` — "not a star hire" —
 * so tests about other parts of the embed never see the star drill-down
 * button.
 */
export function makeStars(): MockProxy<StarPlayersService> {
  const stars = mock<StarPlayersService>();
  stars.findByPlayerId.mockResolvedValue(undefined);
  return stars;
}

// Re-export makePlayerRowButton from team-deepdive.test-helpers to avoid duplication.
export { makePlayerRowButton };

export async function makeService({
  players,
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = nullEntityComponents(),
  trophyAwards = makeTrophyAwards(),
  playerDeath = makePlayerDeath(),
  stars = makeStars(),
  playerRowButton = makePlayerRowButton(),
}: MakeServiceOptions): Promise<{
  service: PlayerDeepdiveService;
  entityComponents: MockProxy<EntityComponentsService>;
  trophyAwards: MockProxy<TrophyAwardsService>;
  playerDeath: MockProxy<PlayerDeathService>;
  stars: MockProxy<StarPlayersService>;
  playerRowButton: MockProxy<PlayerRowButtonService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerDeepdiveService,
      PlayerKillsSectionService,
      { provide: PlayersService, useValue: players },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: TrophyAwardsService, useValue: trophyAwards },
      { provide: PlayerDeathService, useValue: playerDeath },
      { provide: StarPlayersService, useValue: stars },
      { provide: PlayerRowButtonService, useValue: playerRowButton },
    ],
  }).compile();
  return {
    service: moduleRef.get(PlayerDeepdiveService),
    entityComponents,
    trophyAwards,
    playerDeath,
    stars,
    playerRowButton,
  };
}

export function makePlayers(options: {
  player?: {
    id: number;
    name: string;
    teamName: string;
    teamId: number;
    raceName: string;
    raceId: number;
    positionName: string;
    eraName: string;
    eraId: number;
    sppTotal: number | null;
    sppAdjustment: number | null;
  };
  counts?: Partial<PlayerDeepdiveCategoryCounts>;
}): PlayersService {
  const players = mock<PlayersService>();
  players.findById.mockResolvedValue(options.player);
  players.getDeepdiveCategoryCounts.mockResolvedValue({
    simple: [],
    casualties: { total: 0, seriousInjuries: 0, killed: 0 },
    fouls: { total: 0, seriousInjuries: 0, killed: 0 },
    ...options.counts,
  });
  return players;
}
