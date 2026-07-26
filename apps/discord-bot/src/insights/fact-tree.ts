import type { FactNode, FactTreeDeps } from './fact-tree.types';

/**
 * buildFactTree is a pure function invoked once by FactTreeFactoryService,
 * which injects the fact services below through DI and passes them straight
 * through as the FactTreeDeps bag.
 */
export function buildFactTree(deps: FactTreeDeps): FactNode {
  return {
    coach: {
      toplist: {
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => deps.coachToplist.resolveMatchesPlayed(scope),
          },
        },
        teams: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: false,
          resolve: (scope) => deps.coachToplist.resolveTeams(scope),
        },
        competitions: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              deps.coachToplist.resolveCompetitionsPlayed(scope),
          },
        },
        eras: {
          active: {
            supportsLeague: false,
            supportsEra: false,
            supportsCompetition: false,
            resolve: () => deps.coachToplist.resolveErasActive(),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => deps.coachToplist.resolveFoulsCommitted(scope),
          },
        },
        timeBetweenMatches: {
          longest: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              deps.coachToplist.resolveLongestTimeBetweenMatches(scope),
          },
          shortest: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              deps.coachToplist.resolveShortestTimeBetweenMatches(scope),
          },
          average: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              deps.coachToplist.resolveAverageTimeBetweenMatches(scope),
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
            resolve: (scope) => deps.teamToplist.resolveMatchesPlayed(scope),
          },
        },
        competitions: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              deps.teamToplist.resolveCompetitionsPlayed(scope),
          },
        },
        eras: {
          active: {
            supportsLeague: false,
            supportsEra: false,
            supportsCompetition: false,
            resolve: () => deps.teamToplist.resolveErasActive(),
          },
        },
        touchdowns: {
          scored: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => deps.teamToplist.resolveTouchdownsScored(scope),
          },
        },
        completions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => deps.teamToplist.resolveCompletions(scope),
        },
        interceptions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => deps.teamToplist.resolveInterceptions(scope),
        },
        deflections: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => deps.teamToplist.resolveDeflections(scope),
        },
        casualties: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => deps.teamToplist.resolveCasualtiesCaused(scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              deps.teamToplist.resolveCasualtiesSuffered(scope),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                deps.teamToplist.resolveSeriousInjuriesCaused(scope),
            },
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                deps.teamToplist.resolveSeriousInjuriesSuffered(scope),
            },
          },
          lasting: {
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                deps.teamToplist.resolveLastingInjuriesSuffered(scope),
            },
          },
        },
        deaths: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => deps.teamToplist.resolveDeathsCaused(scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => deps.teamToplist.resolveDeathsSuffered(scope),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => deps.teamToplist.resolveFoulsCommitted(scope),
          },
        },
        sent_off: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => deps.teamToplist.resolveTimesSentOff(scope),
        },
        expensiveMistakes: {
          total: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => deps.expensiveMistakes.resolveTotal(scope),
          },
          biggest: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => deps.expensiveMistakes.resolveBiggest(scope),
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
          resolve: (scope) => deps.playerToplist.resolveMvps(scope),
        },
        touchdowns: {
          scored: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              deps.playerToplist.resolveTouchdownsScored(scope),
          },
        },
        completions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => deps.playerToplist.resolveCompletions(scope),
        },
        interceptions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => deps.playerToplist.resolveInterceptions(scope),
        },
        deflections: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => deps.playerToplist.resolveDeflections(scope),
        },
        casualties: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              deps.playerToplist.resolveCasualtiesCaused(scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              deps.playerToplist.resolveCasualtiesSuffered(scope),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                deps.playerToplist.resolveSeriousInjuriesCaused(scope),
            },
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                deps.playerToplist.resolveSeriousInjuriesSuffered(scope),
            },
          },
          lasting: {
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                deps.playerToplist.resolveLastingInjuriesSuffered(scope),
            },
          },
        },
        deaths: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => deps.playerToplist.resolveDeathsCaused(scope),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => deps.playerToplist.resolveFoulsCommitted(scope),
          },
        },
        sent_off: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => deps.playerToplist.resolveTimesSentOff(scope),
        },
      },
    },
    race: {
      toplist: {
        teams: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: false,
          resolve: (scope) => deps.raceToplist.resolveTeams(scope),
        },
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => deps.raceToplist.resolveMatchesPlayed(scope),
          },
        },
      },
    },
    eras: {
      list: {
        supportsLeague: true,
        supportsEra: false,
        supportsCompetition: false,
        resolve: (scope) => deps.erasList.resolve(scope),
      },
    },
    stats: {
      supportsLeague: true,
      supportsEra: true,
      supportsCompetition: true,
      resolve: (scope) => deps.statsSummary.resolve(scope),
    },
  };
}
