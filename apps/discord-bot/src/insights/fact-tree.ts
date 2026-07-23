import { DatabaseTimeoutService } from '../database-timeout.service';
import type { FactNode } from './fact-tree.types';
import { CoachToplistService } from './facts/coach-toplist.service';
import { ErasListService } from './facts/eras-list.service';
import { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import { PlayerToplistService } from './facts/player-toplist.service';
import { RaceToplistService } from './facts/race-toplist.service';
import type { StatsSummaryDeps } from './facts/stats-summary';
import { resolveStatsSummary } from './facts/stats-summary';
import { TeamToplistService } from './facts/team-toplist.service';
import { LeaderboardService } from './leaderboard.service';

/**
 * buildFactTree is a pure function invoked once by FactTreeFactoryService, so
 * the toplist services converted so far (coach/race/expensive-mistakes/eras/
 * team/player) are instantiated directly here rather than injected — this
 * factory doesn't have a DI container to pull from until Task 12 rewires it.
 */
export function buildFactTree(deps: StatsSummaryDeps): FactNode {
  const leaderboard = new LeaderboardService(new DatabaseTimeoutService());
  const coachToplist = new CoachToplistService(deps.coaches, leaderboard);
  const raceToplist = new RaceToplistService(deps.races, leaderboard);
  const expensiveMistakesToplist = new ExpensiveMistakesToplistService(
    deps.teams,
    leaderboard,
  );
  const erasList = new ErasListService(deps.eras, new DatabaseTimeoutService());
  const teamToplist = new TeamToplistService(deps.teams, leaderboard);
  const playerToplist = new PlayerToplistService(deps.players, leaderboard);
  return {
    coach: {
      toplist: {
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => coachToplist.resolveMatchesPlayed(scope),
          },
        },
        teams: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: false,
          resolve: (scope) => coachToplist.resolveTeams(scope),
        },
        competitions: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => coachToplist.resolveCompetitionsPlayed(scope),
          },
        },
        eras: {
          active: {
            supportsLeague: false,
            supportsEra: false,
            supportsCompetition: false,
            resolve: () => coachToplist.resolveErasActive(),
          },
        },
      },
    },
    team: {
      toplist: {
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => teamToplist.resolveMatchesPlayed(scope),
          },
        },
        competitions: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => teamToplist.resolveCompetitionsPlayed(scope),
          },
        },
        eras: {
          active: {
            supportsLeague: false,
            supportsEra: false,
            supportsCompetition: false,
            resolve: () => teamToplist.resolveErasActive(),
          },
        },
        touchdowns: {
          scored: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => teamToplist.resolveTouchdownsScored(scope),
          },
        },
        completions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => teamToplist.resolveCompletions(scope),
        },
        interceptions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => teamToplist.resolveInterceptions(scope),
        },
        deflections: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => teamToplist.resolveDeflections(scope),
        },
        casualties: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => teamToplist.resolveCasualtiesCaused(scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => teamToplist.resolveCasualtiesSuffered(scope),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                teamToplist.resolveSeriousInjuriesCaused(scope),
            },
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                teamToplist.resolveSeriousInjuriesSuffered(scope),
            },
          },
          lasting: {
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                teamToplist.resolveLastingInjuriesSuffered(scope),
            },
          },
        },
        deaths: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => teamToplist.resolveDeathsCaused(scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => teamToplist.resolveDeathsSuffered(scope),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => teamToplist.resolveFoulsCommitted(scope),
          },
        },
        sent_off: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => teamToplist.resolveTimesSentOff(scope),
        },
        expensiveMistakes: {
          total: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => expensiveMistakesToplist.resolveTotal(scope),
          },
          biggest: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => expensiveMistakesToplist.resolveBiggest(scope),
          },
        },
      },
    },
    player: {
      toplist: {
        mvps: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => playerToplist.resolveMvps(scope),
        },
        touchdowns: {
          scored: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => playerToplist.resolveTouchdownsScored(scope),
          },
        },
        completions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => playerToplist.resolveCompletions(scope),
        },
        interceptions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => playerToplist.resolveInterceptions(scope),
        },
        deflections: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => playerToplist.resolveDeflections(scope),
        },
        casualties: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => playerToplist.resolveCasualtiesCaused(scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => playerToplist.resolveCasualtiesSuffered(scope),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                playerToplist.resolveSeriousInjuriesCaused(scope),
            },
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                playerToplist.resolveSeriousInjuriesSuffered(scope),
            },
          },
          lasting: {
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                playerToplist.resolveLastingInjuriesSuffered(scope),
            },
          },
        },
        deaths: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => playerToplist.resolveDeathsCaused(scope),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => playerToplist.resolveFoulsCommitted(scope),
          },
        },
        sent_off: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => playerToplist.resolveTimesSentOff(scope),
        },
      },
    },
    race: {
      toplist: {
        teams: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: false,
          resolve: (scope) => raceToplist.resolveTeams(scope),
        },
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => raceToplist.resolveMatchesPlayed(scope),
          },
        },
      },
    },
    eras: {
      list: {
        supportsLeague: true,
        supportsEra: false,
        supportsCompetition: false,
        resolve: (scope) => erasList.resolve(scope),
      },
    },
    stats: {
      supportsLeague: true,
      supportsEra: true,
      supportsCompetition: true,
      resolve: (scope) => resolveStatsSummary(deps, scope),
    },
  };
}
