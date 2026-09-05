import type { TeamHonor } from '@blood-bowl-tracker/game-data';
import {
  TeamsService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { mockDatabaseTimeout } from '../../database-timeout-mock.test-helpers';
import { EntityComponentsService } from '../../entity-components.service';
import { passthroughEntityComponents } from '../../entity-components-mock.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { PlayerContextService } from '../../insights/player-context.service';
import { passthroughPlayerContext } from '../../insights/player-context-mock.test-helpers';
import { EraSectionGrouperService } from '../../shared/era-section-grouper.service';
import { singleEraSectionGrouper } from '../../shared/era-section-grouper-mock.test-helpers';
import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../button-custom-ids';
import { PlayerRowButtonService } from '../player-row-button.service';
import { TeamDeepdiveService } from './team-deepdive.service';

/**
 * Test-only helper. Do not import from production code.
 *
 * Shared fixtures and builders for `TeamDeepdiveService` specs, split across
 * `team-deepdive.service.spec.ts` (header, career span, top-players list, and
 * the core honors rendering) and `team-deepdive.service.buttons.spec.ts` (the
 * drill-down button entries and the honors-flow timeout paths) to keep each
 * file under the repo's 1000-line spec ceiling — see `CLAUDE.md`'s "Maximum
 * file size".
 */

export const grinders = {
  id: 1,
  name: '40 grinders',
  raceName: 'Dwarf',
  raceId: 4,
  coachName: 'Roze Madder',
  coachId: 12,
};

export const spikeCup: TeamHonor = {
  trophyId: 7,
  trophyName: 'Spike! Cup',
  competitionName: 'Season 4 Major',
  competitionStartDate: '2024-01-15',
  eraId: 20,
  eraName: 'Season 4',
  playerId: null,
  playerName: null,
  playerPositionId: null,
  playerPositionName: null,
  playerIsStarPlayer: null,
};

export const mvp: TeamHonor = {
  trophyId: 9,
  trophyName: 'MVP',
  competitionName: 'Season 4 Minor',
  competitionStartDate: '2024-01-10',
  eraId: 20,
  eraName: 'Season 4',
  playerId: 55,
  playerName: 'Grombrindal',
  playerPositionId: 60,
  playerPositionName: 'Blitzer',
  playerIsStarPlayer: false,
};

/**
 * A `TrophyAwardsService` mock. Defaults to a team with no honors, so tests
 * about other parts of the embed are unaffected by the trophies section,
 * which is omitted entirely in that case. `count` defaults to the row count,
 * so a test only supplies it when exercising the overflow remainder.
 */
export function makeTrophyAwards(
  honors: TeamHonor[] = [],
  count = honors.length,
): MockProxy<TrophyAwardsService> {
  const trophyAwards = mock<TrophyAwardsService>();
  trophyAwards.countByTeam.mockResolvedValue(count);
  trophyAwards.listByTeam.mockResolvedValue(honors);
  return trophyAwards;
}

/**
 * A `PlayerRowButtonService` mock. Returns a fixed canned regular-player
 * entry by default so tests about other parts of the embed are unaffected; a
 * star test stubs a star entry for the one row it cares about. The mock
 * deliberately does NOT reimplement the real star-vs-regular rule, nor derive
 * its return value from the row it's called with — that rule is tested in
 * `player-row-button.service.spec.ts`. A test that cares which row the
 * button was built from asserts on the call args (`toHaveBeenCalledWith`),
 * not on the mock's return value.
 */
export function makePlayerRowButton(): MockProxy<PlayerRowButtonService> {
  const playerRowButton = mock<PlayerRowButtonService>();
  playerRowButton.buildPlayerRowButton.mockReturnValue({
    customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
    entityId: '1',
    label: 'Griff Oberwald',
  });
  return playerRowButton;
}

export interface MakeServiceOptions {
  teams: TeamsService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  leaderboard?: MockProxy<LeaderboardService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  playerContext?: MockProxy<PlayerContextService>;
  trophyAwards?: MockProxy<TrophyAwardsService>;
  eraSectionGrouper?: MockProxy<EraSectionGrouperService>;
  playerRowButton?: MockProxy<PlayerRowButtonService>;
}

export async function makeService({
  teams,
  databaseTimeout = mockDatabaseTimeout(),
  leaderboard = mock<LeaderboardService>(),
  entityComponents = passthroughEntityComponents(),
  playerContext = passthroughPlayerContext(),
  trophyAwards = makeTrophyAwards(),
  eraSectionGrouper = singleEraSectionGrouper(),
  playerRowButton = makePlayerRowButton(),
}: MakeServiceOptions): Promise<{
  service: TeamDeepdiveService;
  leaderboard: MockProxy<LeaderboardService>;
  entityComponents: MockProxy<EntityComponentsService>;
  trophyAwards: MockProxy<TrophyAwardsService>;
  playerRowButton: MockProxy<PlayerRowButtonService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TeamDeepdiveService,
      { provide: TeamsService, useValue: teams },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: PlayerContextService, useValue: playerContext },
      { provide: TrophyAwardsService, useValue: trophyAwards },
      { provide: EraSectionGrouperService, useValue: eraSectionGrouper },
      { provide: PlayerRowButtonService, useValue: playerRowButton },
    ],
  }).compile();
  return {
    service: moduleRef.get(TeamDeepdiveService),
    leaderboard,
    entityComponents,
    trophyAwards,
    playerRowButton,
  };
}

export function makeTeams(options: {
  team?: {
    id: number;
    name: string;
    raceName: string;
    raceId: number;
    coachName: string;
    coachId: number;
  };
  eras?: { id: number; name: string }[];
  span?: { start: string; end: string };
  topPlayers?: {
    playerId: number;
    name: string;
    count: number;
    positionId: number;
    positionName: string;
    isStarPlayer: boolean;
  }[];
}): TeamsService {
  const teams = mock<TeamsService>();
  teams.findById.mockResolvedValue(options.team);
  teams.listEras.mockResolvedValue(options.eras ?? []);
  teams.getCareerSpan.mockResolvedValue(options.span);
  teams.getTopPlayersByTotalSpp.mockResolvedValue(options.topPlayers ?? []);
  return teams;
}
