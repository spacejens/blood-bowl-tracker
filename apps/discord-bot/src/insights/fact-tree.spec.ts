import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { buildFactTree } from './fact-tree';
import type { FactLeaf } from './fact-tree-utils';
import { collectLeaves, resolvePath } from './fact-tree-utils';
import type { StatsSummaryDeps } from './facts/stats-summary';
import { TOPLIST_FETCH_LIMIT } from './leaderboard';

function deps() {
  const zero = () => ({ countAll: vi.fn().mockResolvedValue(0) });
  return {
    coaches: {
      countMatchesPlayedByCoach: vi.fn().mockResolvedValue([]),
      countTeamsByCoach: vi.fn().mockResolvedValue([]),
      countCompetitionsByCoach: vi.fn().mockResolvedValue([]),
      countErasByCoach: vi.fn().mockResolvedValue([]),
      countAll: vi.fn().mockResolvedValue(0),
    } as unknown as CoachesService,
    teams: {
      countMatchesPlayedByTeam: vi.fn().mockResolvedValue([]),
      countCompetitionsByTeam: vi.fn().mockResolvedValue([]),
      countErasByTeam: vi.fn().mockResolvedValue([]),
      countTouchdownsScoredByTeam: vi.fn().mockResolvedValue([]),
      countCompletionsByTeam: vi.fn().mockResolvedValue([]),
      countInterceptionsByTeam: vi.fn().mockResolvedValue([]),
      countDeflectionsByTeam: vi.fn().mockResolvedValue([]),
      countCasualtiesCausedByTeam: vi.fn().mockResolvedValue([]),
      countSeriousInjuriesCausedByTeam: vi.fn().mockResolvedValue([]),
      countDeathsCausedByTeam: vi.fn().mockResolvedValue([]),
      countFoulsCommittedByTeam: vi.fn().mockResolvedValue([]),
      countTimesSentOffByTeam: vi.fn().mockResolvedValue([]),
      countCasualtiesSufferedByTeam: vi.fn().mockResolvedValue([]),
      countSeriousInjuriesSufferedByTeam: vi.fn().mockResolvedValue([]),
      countLastingInjuriesSufferedByTeam: vi.fn().mockResolvedValue([]),
      countDeathsSufferedByTeam: vi.fn().mockResolvedValue([]),
      sumExpensiveMistakesByTeam: vi.fn().mockResolvedValue([]),
      listBiggestExpensiveMistakes: vi.fn().mockResolvedValue([]),
      countAll: vi.fn().mockResolvedValue(0),
    } as unknown as TeamsService,
    matches: {
      countAll: vi.fn().mockResolvedValue(0),
      countMatchEvents: vi.fn().mockResolvedValue(0),
    } as unknown as MatchesService,
    competitions: {
      countAll: vi.fn().mockResolvedValue(0),
      countByType: vi.fn().mockResolvedValue(0),
    } as unknown as CompetitionsService,
    leagues: zero() as unknown as LeaguesService,
    rulesSets: zero() as unknown as RulesSetsService,
    eras: {
      countAll: vi.fn().mockResolvedValue(0),
      listErasWithLeague: vi.fn().mockResolvedValue([]),
      getRulesSetNames: vi.fn().mockResolvedValue([]),
    } as unknown as ErasService,
    players: {
      countMvpAwardsByPlayer: vi.fn().mockResolvedValue([]),
      countTouchdownsScoredByPlayer: vi.fn().mockResolvedValue([]),
      countCompletionsByPlayer: vi.fn().mockResolvedValue([]),
      countInterceptionsByPlayer: vi.fn().mockResolvedValue([]),
      countDeflectionsByPlayer: vi.fn().mockResolvedValue([]),
      countCasualtiesCausedByPlayer: vi.fn().mockResolvedValue([]),
      countSeriousInjuriesCausedByPlayer: vi.fn().mockResolvedValue([]),
      countDeathsCausedByPlayer: vi.fn().mockResolvedValue([]),
      countFoulsCommittedByPlayer: vi.fn().mockResolvedValue([]),
      countTimesSentOffByPlayer: vi.fn().mockResolvedValue([]),
      countCasualtiesSufferedByPlayer: vi.fn().mockResolvedValue([]),
      countSeriousInjuriesSufferedByPlayer: vi.fn().mockResolvedValue([]),
      countLastingInjuriesSufferedByPlayer: vi.fn().mockResolvedValue([]),
      countAll: vi.fn().mockResolvedValue(0),
    } as unknown as PlayersService,
    positions: zero() as unknown as PositionsService,
    races: {
      countTeamsByRace: vi.fn().mockResolvedValue([]),
      countMatchesPlayedByRace: vi.fn().mockResolvedValue([]),
      countAll: vi.fn().mockResolvedValue(0),
    } as unknown as RacesService,
    externalSystems: zero() as unknown as ExternalSystemsService,
  };
}

describe('buildFactTree', () => {
  it('exposes exactly thirty-nine leaf facts', () => {
    expect(collectLeaves(buildFactTree(deps()))).toHaveLength(39);
  });

  it('wires coach.toplist.matches.played to the coach match-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'coach.toplist.matches.played');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });

  it('wires coach.toplist.teams to the coach team-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'coach.toplist.teams');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coaches.countTeamsByCoach).toHaveBeenCalled();
  });

  it('wires coach.toplist.competitions.played to the coach competition-count query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'coach.toplist.competitions.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coaches.countCompetitionsByCoach).toHaveBeenCalled();
  });

  it('wires coach.toplist.eras.active to the coach era-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'coach.toplist.eras.active');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coaches.countErasByCoach).toHaveBeenCalled();
  });

  it('wires team.toplist.matches.played to the team match-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.matches.played');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countMatchesPlayedByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.competitions.played to the team competition-count query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.competitions.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countCompetitionsByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.eras.active to the team era-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.eras.active');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countErasByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.touchdowns.scored to the team touchdown-count query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countTouchdownsScoredByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.completions to the team completion-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.completions');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countCompletionsByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.interceptions to the team interception-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.interceptions');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countInterceptionsByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.deflections to the team deflection-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.deflections');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countDeflectionsByTeam).toHaveBeenCalled();
  });

  it('wires player.toplist.mvps to the player mvp-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'player.toplist.mvps');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countMvpAwardsByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.touchdowns.scored to the player touchdown-count query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'player.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countTouchdownsScoredByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.completions to the player completion-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'player.toplist.completions');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countCompletionsByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.interceptions to the player interception-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'player.toplist.interceptions');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countInterceptionsByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.deflections to the player deflection-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'player.toplist.deflections');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countDeflectionsByPlayer).toHaveBeenCalled();
  });

  it('wires team.toplist.casualties.caused to the team casualty-count query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.casualties.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countCasualtiesCausedByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.serious.caused to the team serious-injury-count query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.serious.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countSeriousInjuriesCausedByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.deaths.caused to the team death-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.deaths.caused');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countDeathsCausedByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.casualties.suffered to the team casualties-suffered query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.casualties.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countCasualtiesSufferedByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.serious.suffered to the team serious-injuries-suffered query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.serious.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countSeriousInjuriesSufferedByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.lasting.suffered to the team lasting-injuries-suffered query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.lasting.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countLastingInjuriesSufferedByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.deaths.suffered to the team deaths-suffered query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.deaths.suffered');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countDeathsSufferedByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.fouls.committed to the team foul-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.fouls.committed');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countFoulsCommittedByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.sent_off to the team sent-off-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.sent_off');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countTimesSentOffByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.expensiveMistakes.total to the team expensive-mistake sum query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.expensiveMistakes.total',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.sumExpensiveMistakesByTeam).toHaveBeenCalled();
  });

  it('wires team.toplist.expensiveMistakes.biggest to the biggest expensive-mistake list query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.expensiveMistakes.biggest',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.listBiggestExpensiveMistakes).toHaveBeenCalled();
  });

  it('wires player.toplist.casualties.caused to the player casualty-count query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'player.toplist.casualties.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countCasualtiesCausedByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.serious.caused to the player serious-injury-count query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.serious.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countSeriousInjuriesCausedByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.deaths.caused to the player death-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'player.toplist.deaths.caused');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countDeathsCausedByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.casualties.suffered to the player casualties-suffered query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'player.toplist.casualties.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countCasualtiesSufferedByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.serious.suffered to the player serious-injuries-suffered query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.serious.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countSeriousInjuriesSufferedByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.lasting.suffered to the player lasting-injuries-suffered query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.lasting.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countLastingInjuriesSufferedByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.fouls.committed to the player foul-count query', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'player.toplist.fouls.committed',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countFoulsCommittedByPlayer).toHaveBeenCalled();
  });

  it('wires player.toplist.sent_off to the player sent-off-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'player.toplist.sent_off');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.players.countTimesSentOffByPlayer).toHaveBeenCalled();
  });

  it('wires race.toplist.teams to the race team-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'race.toplist.teams');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.races.countTeamsByRace).toHaveBeenCalled();
  });

  it('wires race.toplist.matches.played to the race match-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'race.toplist.matches.played');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.races.countMatchesPlayedByRace).toHaveBeenCalled();
  });

  it('wires stats to the entity-count summary', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'stats');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(d.leagues.countAll).toHaveBeenCalled();
  });

  it('wires eras.list to the eras list query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'eras.list');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.eras.listErasWithLeague).toHaveBeenCalled();
  });
});

describe('buildFactTree leaf capabilities', () => {
  it('excludes some leaves from era filtering', () => {
    const tree = buildFactTree({} as StatsSummaryDeps);
    const unsupported = collectLeaves(tree).filter((leaf) => !leaf.supportsEra);
    expect(unsupported).toEqual(
      expect.arrayContaining([
        resolvePath(tree, 'eras.list'),
        resolvePath(tree, 'team.toplist.eras.active'),
        resolvePath(tree, 'coach.toplist.eras.active'),
      ]),
    );
    expect(unsupported).toHaveLength(3);
  });
});

describe('buildFactTree league capabilities', () => {
  it('every leaf supports league exactly when it supports era', () => {
    const tree = buildFactTree({} as StatsSummaryDeps);
    const leaves = collectLeaves(tree);
    for (const leaf of leaves) {
      expect(leaf.supportsLeague).toBe(leaf.supportsEra);
    }
  });
});

describe('buildFactTree competition capabilities', () => {
  it('includes only the team/player toplists and stats that support competition filtering', () => {
    const tree = buildFactTree({} as StatsSummaryDeps);
    const supported = collectLeaves(tree).filter(
      (leaf) => leaf.supportsCompetition,
    );
    expect(supported).toEqual(
      expect.arrayContaining([
        resolvePath(tree, 'team.toplist.touchdowns.scored'),
        resolvePath(tree, 'team.toplist.completions'),
        resolvePath(tree, 'team.toplist.interceptions'),
        resolvePath(tree, 'team.toplist.deflections'),
        resolvePath(tree, 'team.toplist.casualties.caused'),
        resolvePath(tree, 'team.toplist.casualties.suffered'),
        resolvePath(tree, 'team.toplist.injuries.serious.caused'),
        resolvePath(tree, 'team.toplist.injuries.serious.suffered'),
        resolvePath(tree, 'team.toplist.injuries.lasting.suffered'),
        resolvePath(tree, 'team.toplist.deaths.caused'),
        resolvePath(tree, 'team.toplist.deaths.suffered'),
        resolvePath(tree, 'team.toplist.fouls.committed'),
        resolvePath(tree, 'team.toplist.sent_off'),
        resolvePath(tree, 'team.toplist.expensiveMistakes.total'),
        resolvePath(tree, 'team.toplist.expensiveMistakes.biggest'),
        resolvePath(tree, 'player.toplist.mvps'),
        resolvePath(tree, 'player.toplist.touchdowns.scored'),
        resolvePath(tree, 'player.toplist.completions'),
        resolvePath(tree, 'player.toplist.interceptions'),
        resolvePath(tree, 'player.toplist.deflections'),
        resolvePath(tree, 'player.toplist.casualties.caused'),
        resolvePath(tree, 'player.toplist.casualties.suffered'),
        resolvePath(tree, 'player.toplist.injuries.serious.caused'),
        resolvePath(tree, 'player.toplist.injuries.serious.suffered'),
        resolvePath(tree, 'player.toplist.injuries.lasting.suffered'),
        resolvePath(tree, 'player.toplist.deaths.caused'),
        resolvePath(tree, 'player.toplist.fouls.committed'),
        resolvePath(tree, 'player.toplist.sent_off'),
        resolvePath(tree, 'stats'),
      ]),
    );
    expect(supported).toHaveLength(29);
  });

  it('forwards competitionId to an in-scope team leaf', async () => {
    const d = deps();
    const leaf = resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(d.teams.countTouchdownsScoredByTeam).toHaveBeenCalledWith(
      { competitionId: 30 },
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('forwards competitionId to an in-scope player leaf', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'player.toplist.mvps');
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(d.players.countMvpAwardsByPlayer).toHaveBeenCalledWith(
      { competitionId: 30 },
      TOPLIST_FETCH_LIMIT,
    );
  });
});
