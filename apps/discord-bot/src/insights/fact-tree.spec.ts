import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildFactTree } from './fact-tree';
import { stubFactTreeDeps } from './fact-tree.test-helpers';
import type { FactLeaf } from './fact-tree.types';
import { FactTreeNavigationService } from './fact-tree-navigation.service';

let factTreeNavigation: FactTreeNavigationService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    providers: [FactTreeNavigationService],
  }).compile();
  factTreeNavigation = moduleRef.get(FactTreeNavigationService);
});

describe('buildFactTree', () => {
  it('exposes exactly ninety leaf facts', () => {
    expect(
      factTreeNavigation.collectLeaves(buildFactTree(stubFactTreeDeps())),
    ).toHaveLength(90);
  });

  it('wires coach.toplist.matches.played to CoachToplistService.resolveMatchesPlayed', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.matches.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it.each([
    ['coach.toplist.matches.won', 'coachToplist', 'resolveMatchesWon'],
    ['coach.toplist.matches.lost', 'coachToplist', 'resolveMatchesLost'],
    ['coach.toplist.matches.drawn', 'coachToplist', 'resolveMatchesDrawn'],
    ['team.toplist.matches.won', 'teamToplist', 'resolveMatchesWon'],
    ['team.toplist.matches.lost', 'teamToplist', 'resolveMatchesLost'],
    ['team.toplist.matches.drawn', 'teamToplist', 'resolveMatchesDrawn'],
    [
      'team.toplist.touchdowns.average.scored.descending',
      'teamToplist',
      'resolveAverageTouchdownsScoredDescending',
    ],
    [
      'team.toplist.touchdowns.average.scored.ascending',
      'teamToplist',
      'resolveAverageTouchdownsScoredAscending',
    ],
    [
      'team.toplist.touchdowns.average.conceded.descending',
      'teamToplist',
      'resolveAverageTouchdownsConcededDescending',
    ],
    [
      'team.toplist.touchdowns.average.conceded.ascending',
      'teamToplist',
      'resolveAverageTouchdownsConcededAscending',
    ],
    [
      'team.toplist.casualties.average.caused.descending',
      'teamToplist',
      'resolveAverageCasualtiesCausedDescending',
    ],
    [
      'team.toplist.casualties.average.caused.ascending',
      'teamToplist',
      'resolveAverageCasualtiesCausedAscending',
    ],
    [
      'team.toplist.casualties.average.suffered.descending',
      'teamToplist',
      'resolveAverageCasualtiesSufferedDescending',
    ],
    [
      'team.toplist.casualties.average.suffered.ascending',
      'teamToplist',
      'resolveAverageCasualtiesSufferedAscending',
    ],
    [
      'team.toplist.injuries.serious.average.caused.descending',
      'teamToplist',
      'resolveAverageSeriousInjuriesCausedDescending',
    ],
    [
      'team.toplist.injuries.serious.average.caused.ascending',
      'teamToplist',
      'resolveAverageSeriousInjuriesCausedAscending',
    ],
    [
      'team.toplist.injuries.serious.average.suffered.descending',
      'teamToplist',
      'resolveAverageSeriousInjuriesSufferedDescending',
    ],
    [
      'team.toplist.injuries.serious.average.suffered.ascending',
      'teamToplist',
      'resolveAverageSeriousInjuriesSufferedAscending',
    ],
    [
      'team.toplist.injuries.lasting.average.caused.descending',
      'teamToplist',
      'resolveAverageLastingInjuriesCausedDescending',
    ],
    [
      'team.toplist.injuries.lasting.average.caused.ascending',
      'teamToplist',
      'resolveAverageLastingInjuriesCausedAscending',
    ],
    [
      'team.toplist.injuries.lasting.average.suffered.descending',
      'teamToplist',
      'resolveAverageLastingInjuriesSufferedDescending',
    ],
    [
      'team.toplist.injuries.lasting.average.suffered.ascending',
      'teamToplist',
      'resolveAverageLastingInjuriesSufferedAscending',
    ],
    [
      'team.toplist.deaths.average.caused.descending',
      'teamToplist',
      'resolveAverageDeathsCausedDescending',
    ],
    [
      'team.toplist.deaths.average.caused.ascending',
      'teamToplist',
      'resolveAverageDeathsCausedAscending',
    ],
    [
      'team.toplist.deaths.average.suffered.descending',
      'teamToplist',
      'resolveAverageDeathsSufferedDescending',
    ],
    [
      'team.toplist.deaths.average.suffered.ascending',
      'teamToplist',
      'resolveAverageDeathsSufferedAscending',
    ],
    ['race.toplist.matches.won', 'raceToplist', 'resolveMatchesWon'],
    ['race.toplist.matches.lost', 'raceToplist', 'resolveMatchesLost'],
    ['race.toplist.matches.drawn', 'raceToplist', 'resolveMatchesDrawn'],
    ['position.toplist.players', 'positionToplist', 'resolvePlayers'],
    ['skill.toplist.players.any', 'skillToplist', 'resolveAny'],
    [
      'skill.toplist.players.advancement.any',
      'skillToplist',
      'resolveAdvancementAny',
    ],
    [
      'skill.toplist.players.advancement.chosen',
      'skillToplist',
      'resolveAdvancementChosen',
    ],
    [
      'skill.toplist.players.advancement.random',
      'skillToplist',
      'resolveAdvancementRandom',
    ],
  ] as const)('wires %s to %s.%s', async (path, dep, method) => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(buildFactTree(d), path);
    await (leaf as FactLeaf).resolve({ leagueId: 9 });
    expect(d[dep][method]).toHaveBeenCalledWith({ leagueId: 9 });
  });

  it('wires coach.toplist.teams to CoachToplistService.resolveTeams', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.teams',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveTeams).toHaveBeenCalled();
  });

  it('wires coach.toplist.competitions.played to CoachToplistService.resolveCompetitionsPlayed', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.competitions.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveCompetitionsPlayed).toHaveBeenCalled();
  });

  it('wires coach.toplist.eras.active to CoachToplistService.resolveErasActive', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.eras.active',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveErasActive).toHaveBeenCalled();
  });

  it('wires coach.toplist.fouls.committed to CoachToplistService.resolveFoulsCommitted', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.fouls.committed',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveFoulsCommitted).toHaveBeenCalled();
  });

  it('wires coach.toplist.trophies.won to CoachToplistService.resolveTrophiesWon', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.trophies.won',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    expect(d.coachToplist.resolveTrophiesWon).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });

  it('declares league, era and competition scope but no match category for coach.toplist.trophies.won', () => {
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(stubFactTreeDeps()),
      'coach.toplist.trophies.won',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(true);
    expect(leaf.supportsEra).toBe(true);
    // The only competition-scopable coach toplist: a trophy award belongs to
    // a competition, unlike the match-event-backed coach facts.
    expect(leaf.supportsCompetition).toBe(true);
    // Trophy awards are not match events, so a match category has no meaning
    // here - the leaf deliberately declares it unsupported.
    expect(leaf.supportsMatchCategory).toBe(false);
  });

  it('wires coach.toplist.timeBetweenMatches.longest.descending to CoachToplistService.resolveTimeBetweenMatchesDescending', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.timeBetweenMatches.longest.descending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(
      d.coachToplist.resolveTimeBetweenMatchesDescending,
    ).toHaveBeenCalled();
  });

  it('wires coach.toplist.timeBetweenMatches.longest.ascending to CoachToplistService.resolveTimeBetweenMatchesAscending', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.timeBetweenMatches.longest.ascending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(
      d.coachToplist.resolveTimeBetweenMatchesAscending,
    ).toHaveBeenCalled();
  });

  it('wires coach.toplist.timeBetweenMatches.average to CoachToplistService.resolveAverageTimeBetweenMatches', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.timeBetweenMatches.average',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveAverageTimeBetweenMatches).toHaveBeenCalled();
  });

  it('wires team.toplist.matches.played to TeamToplistService.resolveMatchesPlayed', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.matches.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('wires team.toplist.competitions.played to TeamToplistService.resolveCompetitionsPlayed', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.competitions.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveCompetitionsPlayed).toHaveBeenCalled();
  });

  it('wires team.toplist.eras.active to TeamToplistService.resolveErasActive', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.eras.active',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveErasActive).toHaveBeenCalled();
  });

  it('wires team.toplist.trophies.won to TeamToplistService.resolveTrophiesWon', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.trophies.won',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    expect(d.teamToplist.resolveTrophiesWon).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });

  it('declares league, era and competition scope but no match category for team.toplist.trophies.won', () => {
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(stubFactTreeDeps()),
      'team.toplist.trophies.won',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(true);
    expect(leaf.supportsEra).toBe(true);
    expect(leaf.supportsCompetition).toBe(true);
    // Trophy awards are not match events, so a match category has no meaning
    // here - the leaf deliberately declares it unsupported.
    expect(leaf.supportsMatchCategory).toBe(false);
  });

  it('wires team.toplist.touchdowns.scored to TeamToplistService.resolveTouchdownsScored', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveTouchdownsScored).toHaveBeenCalled();
  });

  it('wires team.toplist.completions to TeamToplistService.resolveCompletions', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.completions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveCompletions).toHaveBeenCalled();
  });

  it('wires team.toplist.interceptions to TeamToplistService.resolveInterceptions', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.interceptions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveInterceptions).toHaveBeenCalled();
  });

  it('wires team.toplist.deflections to TeamToplistService.resolveDeflections', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.deflections',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveDeflections).toHaveBeenCalled();
  });

  it('wires player.toplist.mvps to PlayerToplistService.resolveMvps', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.mvps',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveMvps).toHaveBeenCalled();
  });

  it('wires player.toplist.touchdowns.scored to PlayerToplistService.resolveTouchdownsScored', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveTouchdownsScored).toHaveBeenCalled();
  });

  it('wires player.toplist.completions to PlayerToplistService.resolveCompletions', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.completions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveCompletions).toHaveBeenCalled();
  });

  it('wires player.toplist.interceptions to PlayerToplistService.resolveInterceptions', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.interceptions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveInterceptions).toHaveBeenCalled();
  });

  it('wires player.toplist.deflections to PlayerToplistService.resolveDeflections', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.deflections',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveDeflections).toHaveBeenCalled();
  });

  it('wires team.toplist.casualties.caused to TeamToplistService.resolveCasualtiesCaused', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.casualties.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveCasualtiesCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.serious.caused to TeamToplistService.resolveSeriousInjuriesCaused', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.serious.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveSeriousInjuriesCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.deaths.caused to TeamToplistService.resolveDeathsCaused', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.deaths.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveDeathsCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.casualties.suffered to TeamToplistService.resolveCasualtiesSuffered', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.casualties.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveCasualtiesSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.serious.suffered to TeamToplistService.resolveSeriousInjuriesSuffered', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.serious.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveSeriousInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.lasting.caused to TeamToplistService.resolveLastingInjuriesCaused', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.lasting.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveLastingInjuriesCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.lasting.suffered to TeamToplistService.resolveLastingInjuriesSuffered', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.lasting.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveLastingInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.deaths.suffered to TeamToplistService.resolveDeathsSuffered', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.deaths.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveDeathsSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.fouls.committed to TeamToplistService.resolveFoulsCommitted', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.fouls.committed',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveFoulsCommitted).toHaveBeenCalled();
  });

  it('wires team.toplist.sent_off to TeamToplistService.resolveTimesSentOff', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.sent_off',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveTimesSentOff).toHaveBeenCalled();
  });

  it('wires team.toplist.expensiveMistakes.total to ExpensiveMistakesToplistService.resolveTotal', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.expensiveMistakes.total',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.expensiveMistakes.resolveTotal).toHaveBeenCalled();
  });

  it('wires team.toplist.expensiveMistakes.biggest to ExpensiveMistakesToplistService.resolveBiggest', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.expensiveMistakes.biggest',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.expensiveMistakes.resolveBiggest).toHaveBeenCalled();
  });

  it('wires player.toplist.casualties.caused to PlayerToplistService.resolveCasualtiesCaused', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.casualties.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveCasualtiesCaused).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.serious.caused to PlayerToplistService.resolveSeriousInjuriesCaused', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.serious.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveSeriousInjuriesCaused).toHaveBeenCalled();
  });

  it('wires player.toplist.deaths.caused to PlayerToplistService.resolveDeathsCaused', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.deaths.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveDeathsCaused).toHaveBeenCalled();
  });

  it('wires player.toplist.casualties.suffered to PlayerToplistService.resolveCasualtiesSuffered', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.casualties.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveCasualtiesSuffered).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.serious.suffered to PlayerToplistService.resolveSeriousInjuriesSuffered', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.serious.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveSeriousInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.lasting.suffered to PlayerToplistService.resolveLastingInjuriesSuffered', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.lasting.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveLastingInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires player.toplist.fouls.committed to PlayerToplistService.resolveFoulsCommitted', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.fouls.committed',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveFoulsCommitted).toHaveBeenCalled();
  });

  it('wires player.toplist.sent_off to PlayerToplistService.resolveTimesSentOff', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.sent_off',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveTimesSentOff).toHaveBeenCalled();
  });

  it('wires player.toplist.totalSpp to PlayerToplistService.resolveTotalSpp', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.totalSpp',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveTotalSpp).toHaveBeenCalled();
  });

  it('wires race.toplist.teams.descending to RaceToplistService.resolveTeamsDescending', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'race.toplist.teams.descending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.raceToplist.resolveTeamsDescending).toHaveBeenCalled();
  });

  it('wires race.toplist.teams.ascending to RaceToplistService.resolveTeamsAscending', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'race.toplist.teams.ascending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.raceToplist.resolveTeamsAscending).toHaveBeenCalled();
  });

  it('wires race.toplist.matches.played to RaceToplistService.resolveMatchesPlayed', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'race.toplist.matches.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.raceToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('wires stats to StatsSummaryFactsService.resolve', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(buildFactTree(d), 'stats');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.statsSummary.resolve).toHaveBeenCalled();
  });

  it('wires eras.list to ErasListService.resolve', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(buildFactTree(d), 'eras.list');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.erasList.resolve).toHaveBeenCalled();
  });

  it('wires trophies.list to TrophiesListService.resolve', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'trophies.list',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.trophiesList.resolve).toHaveBeenCalled();
  });

  it('wires competitionGroups.list to CompetitionGroupsListService.resolve', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'competitionGroups.list',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.competitionGroupsList.resolve).toHaveBeenCalled();
  });

  it('wires starPlayers.list to StarPlayersListService.resolve', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'starPlayers.list',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.starPlayersList.resolve).toHaveBeenCalled();
  });

  it('starPlayers.list supports no scoping at all', () => {
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(stubFactTreeDeps()),
      'starPlayers.list',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(false);
    expect(leaf.supportsEra).toBe(false);
    expect(leaf.supportsCompetition).toBe(false);
    expect(leaf.supportsMatchCategory).toBe(false);
  });

  it('wires starPlayers.toplist.hires.total to StarPlayerToplistService.resolveTotalHires', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'starPlayers.toplist.hires.total',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.starPlayerToplist.resolveTotalHires).toHaveBeenCalled();
  });

  it('starPlayers.toplist.hires.total supports no scoping at all', () => {
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(stubFactTreeDeps()),
      'starPlayers.toplist.hires.total',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(false);
    expect(leaf.supportsEra).toBe(false);
    expect(leaf.supportsCompetition).toBe(false);
    expect(leaf.supportsMatchCategory).toBe(false);
  });

  it('wires starPlayers.toplist.hires.distinctTeams to StarPlayerToplistService.resolveDistinctTeamsHired', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'starPlayers.toplist.hires.distinctTeams',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.starPlayerToplist.resolveDistinctTeamsHired).toHaveBeenCalled();
    expect(d.starPlayerToplist.resolveTotalHires).not.toHaveBeenCalled();
  });

  it('starPlayers.toplist.hires.distinctTeams supports no scoping at all', () => {
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(stubFactTreeDeps()),
      'starPlayers.toplist.hires.distinctTeams',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(false);
    expect(leaf.supportsEra).toBe(false);
    expect(leaf.supportsCompetition).toBe(false);
    expect(leaf.supportsMatchCategory).toBe(false);
  });

  it('wires onThisDate to OnThisDateFactsService.resolveToday', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'date.onThisDate',
    );
    await (leaf as FactLeaf).resolve({ eraId: 20 });
    expect(d.onThisDate.resolveToday).toHaveBeenCalledWith({ eraId: 20 });
  });

  it('declares all four scopes supported for onThisDate', () => {
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(stubFactTreeDeps()),
      'date.onThisDate',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(true);
    expect(leaf.supportsEra).toBe(true);
    expect(leaf.supportsCompetition).toBe(true);
    expect(leaf.supportsMatchCategory).toBe(true);
  });

  it('wires date.toplist.matches.descending to DateToplistFactsService.resolveMatchesDescending', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'date.toplist.matches.descending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.dateToplist.resolveMatchesDescending).toHaveBeenCalledWith(
      FACT_SCOPE_ALL_TIME,
    );
  });

  it('wires date.toplist.matches.ascending to DateToplistFactsService.resolveMatchesAscending', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'date.toplist.matches.ascending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.dateToplist.resolveMatchesAscending).toHaveBeenCalledWith(
      FACT_SCOPE_ALL_TIME,
    );
  });

  it('declares league, era and match category scopes for the date matches toplists', () => {
    const tree = buildFactTree(stubFactTreeDeps());
    for (const path of [
      'date.toplist.matches.descending',
      'date.toplist.matches.ascending',
    ]) {
      const leaf = factTreeNavigation.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsLeague).toBe(true);
      expect(leaf.supportsEra).toBe(true);
      expect(leaf.supportsCompetition).toBe(false);
      expect(leaf.supportsMatchCategory).toBe(true);
    }
  });
});
