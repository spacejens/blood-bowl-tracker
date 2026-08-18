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
            supportsMatchCategory: true,
            resolve: (scope) => deps.coachToplist.resolveMatchesPlayed(scope),
          },
          won: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.coachToplist.resolveMatchesWon(scope),
          },
          lost: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.coachToplist.resolveMatchesLost(scope),
          },
          drawn: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.coachToplist.resolveMatchesDrawn(scope),
          },
        },
        teams: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: false,
          supportsMatchCategory: false,
          resolve: (scope) => deps.coachToplist.resolveTeams(scope),
        },
        competitions: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) =>
              deps.coachToplist.resolveCompetitionsPlayed(scope),
          },
        },
        eras: {
          active: {
            supportsLeague: false,
            supportsEra: false,
            supportsCompetition: false,
            supportsMatchCategory: false,
            resolve: () => deps.coachToplist.resolveErasActive(),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.coachToplist.resolveFoulsCommitted(scope),
          },
        },
        timeBetweenMatches: {
          longest: {
            descending: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: false,
              supportsMatchCategory: true,
              resolve: (scope) =>
                deps.coachToplist.resolveTimeBetweenMatchesDescending(scope),
            },
            ascending: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: false,
              supportsMatchCategory: true,
              resolve: (scope) =>
                deps.coachToplist.resolveTimeBetweenMatchesAscending(scope),
            },
          },
          average: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
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
            supportsMatchCategory: true,
            resolve: (scope) => deps.teamToplist.resolveMatchesPlayed(scope),
          },
          won: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.teamToplist.resolveMatchesWon(scope),
          },
          lost: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.teamToplist.resolveMatchesLost(scope),
          },
          drawn: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.teamToplist.resolveMatchesDrawn(scope),
          },
        },
        competitions: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) =>
              deps.teamToplist.resolveCompetitionsPlayed(scope),
          },
        },
        eras: {
          active: {
            supportsLeague: false,
            supportsEra: false,
            supportsCompetition: false,
            supportsMatchCategory: false,
            resolve: () => deps.teamToplist.resolveErasActive(),
          },
        },
        trophies: {
          won: {
            // Counts every trophy_awards row tied to the team - team-level
            // awards and player-level awards its players won alike - matching
            // the team deepdive's own trophy count.
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            // Deliberately no match-category support: a trophy award is not a
            // match event, so there is no category dimension to scope by.
            supportsMatchCategory: false,
            resolve: (scope) => deps.teamToplist.resolveTrophiesWon(scope),
          },
        },
        touchdowns: {
          scored: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
            resolve: (scope) => deps.teamToplist.resolveTouchdownsScored(scope),
          },
        },
        completions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          supportsMatchCategory: true,
          resolve: (scope) => deps.teamToplist.resolveCompletions(scope),
        },
        interceptions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          supportsMatchCategory: true,
          resolve: (scope) => deps.teamToplist.resolveInterceptions(scope),
        },
        deflections: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          supportsMatchCategory: true,
          resolve: (scope) => deps.teamToplist.resolveDeflections(scope),
        },
        casualties: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
            resolve: (scope) => deps.teamToplist.resolveCasualtiesCaused(scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
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
              supportsMatchCategory: true,
              resolve: (scope) =>
                deps.teamToplist.resolveSeriousInjuriesCaused(scope),
            },
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              supportsMatchCategory: true,
              resolve: (scope) =>
                deps.teamToplist.resolveSeriousInjuriesSuffered(scope),
            },
          },
          lasting: {
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              supportsMatchCategory: true,
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
            supportsMatchCategory: true,
            resolve: (scope) => deps.teamToplist.resolveDeathsCaused(scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
            resolve: (scope) => deps.teamToplist.resolveDeathsSuffered(scope),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
            resolve: (scope) => deps.teamToplist.resolveFoulsCommitted(scope),
          },
        },
        sent_off: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          supportsMatchCategory: true,
          resolve: (scope) => deps.teamToplist.resolveTimesSentOff(scope),
        },
        expensiveMistakes: {
          total: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
            resolve: (scope) => deps.expensiveMistakes.resolveTotal(scope),
          },
          biggest: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
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
          supportsMatchCategory: true,
          resolve: (scope) => deps.playerToplist.resolveMvps(scope),
        },
        touchdowns: {
          scored: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
            resolve: (scope) =>
              deps.playerToplist.resolveTouchdownsScored(scope),
          },
        },
        completions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          supportsMatchCategory: true,
          resolve: (scope) => deps.playerToplist.resolveCompletions(scope),
        },
        interceptions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          supportsMatchCategory: true,
          resolve: (scope) => deps.playerToplist.resolveInterceptions(scope),
        },
        deflections: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          supportsMatchCategory: true,
          resolve: (scope) => deps.playerToplist.resolveDeflections(scope),
        },
        casualties: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
            resolve: (scope) =>
              deps.playerToplist.resolveCasualtiesCaused(scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
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
              supportsMatchCategory: true,
              resolve: (scope) =>
                deps.playerToplist.resolveSeriousInjuriesCaused(scope),
            },
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              supportsMatchCategory: true,
              resolve: (scope) =>
                deps.playerToplist.resolveSeriousInjuriesSuffered(scope),
            },
          },
          lasting: {
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              supportsMatchCategory: true,
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
            supportsMatchCategory: true,
            resolve: (scope) => deps.playerToplist.resolveDeathsCaused(scope),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            supportsMatchCategory: true,
            resolve: (scope) => deps.playerToplist.resolveFoulsCommitted(scope),
          },
        },
        sent_off: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          supportsMatchCategory: true,
          resolve: (scope) => deps.playerToplist.resolveTimesSentOff(scope),
        },
        totalSpp: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          supportsMatchCategory: true,
          resolve: (scope) => deps.playerToplist.resolveTotalSpp(scope),
        },
      },
    },
    race: {
      toplist: {
        teams: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: false,
          supportsMatchCategory: false,
          resolve: (scope) => deps.raceToplist.resolveTeams(scope),
        },
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.raceToplist.resolveMatchesPlayed(scope),
          },
          won: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.raceToplist.resolveMatchesWon(scope),
          },
          lost: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.raceToplist.resolveMatchesLost(scope),
          },
          drawn: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            supportsMatchCategory: true,
            resolve: (scope) => deps.raceToplist.resolveMatchesDrawn(scope),
          },
        },
      },
    },
    eras: {
      list: {
        supportsLeague: true,
        supportsEra: false,
        supportsCompetition: false,
        supportsMatchCategory: false,
        resolve: (scope) => deps.erasList.resolve(scope),
      },
    },
    trophies: {
      list: {
        // A trophy belongs to a competition group, which belongs to a league,
        // so the catalog can be narrowed to one league. It is not itself an
        // era-, competition- or category-scoped listing, exactly like
        // eras.list.
        supportsLeague: true,
        supportsEra: false,
        supportsCompetition: false,
        supportsMatchCategory: false,
        resolve: (scope) => deps.trophiesList.resolve(scope),
      },
    },
    competitionGroups: {
      list: {
        // A competition group belongs directly to a league. It is not itself
        // era-, competition- or category-scoped, exactly like eras.list and
        // trophies.list.
        supportsLeague: true,
        supportsEra: false,
        supportsCompetition: false,
        supportsMatchCategory: false,
        resolve: (scope) => deps.competitionGroupsList.resolve(scope),
      },
    },
    stats: {
      supportsLeague: true,
      supportsEra: true,
      supportsCompetition: true,
      // Deliberately excluded: only two of the dozen counts stats reports
      // (matches, match events) have a category dimension, so a
      // category-scoped stats embed would mix scoped and all-time numbers.
      supportsMatchCategory: false,
      resolve: (scope) => deps.statsSummary.resolve(scope),
    },
  };
}
