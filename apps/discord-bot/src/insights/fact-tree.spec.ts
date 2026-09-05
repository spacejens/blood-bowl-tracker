import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { buildFactTree } from './fact-tree';
import type { FactLeaf, FactTreeDeps } from './fact-tree.types';
import { FactTreeUtilsService } from './fact-tree-utils.service';
import { CoachToplistService } from './facts/coach-toplist.service';
import { CompetitionGroupsListService } from './facts/competition-groups-list.service';
import { DateToplistFactsService } from './facts/date-toplist.service';
import { ErasListService } from './facts/eras-list.service';
import { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import { OnThisDateFactsService } from './facts/on-this-date.service';
import { PlayerToplistService } from './facts/player-toplist.service';
import { PositionToplistService } from './facts/position-toplist.service';
import { RaceToplistService } from './facts/race-toplist.service';
import { StarPlayerToplistService } from './facts/star-player-toplist.service';
import { StarPlayersListService } from './facts/star-players-list.service';
import { StatsSummaryFactsService } from './facts/stats-summary.service';
import { TeamToplistService } from './facts/team-toplist.service';
import { TrophiesListService } from './facts/trophies-list.service';

let factTreeUtils: FactTreeUtilsService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    providers: [FactTreeUtilsService],
  }).compile();
  factTreeUtils = moduleRef.get(FactTreeUtilsService);
});

function deps(): FactTreeDeps {
  const coachToplist = mock<CoachToplistService>();
  coachToplist.resolveMatchesPlayed.mockResolvedValue('coach matches played');
  coachToplist.resolveMatchesWon.mockResolvedValue('coach matches won');
  coachToplist.resolveMatchesLost.mockResolvedValue('coach matches lost');
  coachToplist.resolveMatchesDrawn.mockResolvedValue('coach matches drawn');
  coachToplist.resolveTeams.mockResolvedValue('coach teams');
  coachToplist.resolveCompetitionsPlayed.mockResolvedValue(
    'coach competitions played',
  );
  coachToplist.resolveErasActive.mockResolvedValue('coach eras active');
  coachToplist.resolveFoulsCommitted.mockResolvedValue('coach fouls committed');
  coachToplist.resolveTimeBetweenMatchesDescending.mockResolvedValue(
    'coach longest time between matches',
  );
  coachToplist.resolveTimeBetweenMatchesAscending.mockResolvedValue(
    'coach shortest time between matches',
  );
  coachToplist.resolveAverageTimeBetweenMatches.mockResolvedValue(
    'coach average time between matches',
  );

  const teamToplist = mock<TeamToplistService>();
  teamToplist.resolveMatchesPlayed.mockResolvedValue('team matches played');
  teamToplist.resolveMatchesWon.mockResolvedValue('team matches won');
  teamToplist.resolveMatchesLost.mockResolvedValue('team matches lost');
  teamToplist.resolveMatchesDrawn.mockResolvedValue('team matches drawn');
  teamToplist.resolveCompetitionsPlayed.mockResolvedValue(
    'team competitions played',
  );
  teamToplist.resolveErasActive.mockResolvedValue('team eras active');
  teamToplist.resolveTouchdownsScored.mockResolvedValue(
    'team touchdowns scored',
  );
  teamToplist.resolveCompletions.mockResolvedValue('team completions');
  teamToplist.resolveInterceptions.mockResolvedValue('team interceptions');
  teamToplist.resolveDeflections.mockResolvedValue('team deflections');
  teamToplist.resolveCasualtiesCaused.mockResolvedValue(
    'team casualties caused',
  );
  teamToplist.resolveCasualtiesSuffered.mockResolvedValue(
    'team casualties suffered',
  );
  teamToplist.resolveSeriousInjuriesCaused.mockResolvedValue(
    'team serious injuries caused',
  );
  teamToplist.resolveSeriousInjuriesSuffered.mockResolvedValue(
    'team serious injuries suffered',
  );
  teamToplist.resolveLastingInjuriesSuffered.mockResolvedValue(
    'team lasting injuries suffered',
  );
  teamToplist.resolveDeathsCaused.mockResolvedValue('team deaths caused');
  teamToplist.resolveDeathsSuffered.mockResolvedValue('team deaths suffered');
  teamToplist.resolveFoulsCommitted.mockResolvedValue('team fouls committed');
  teamToplist.resolveTimesSentOff.mockResolvedValue('team times sent off');
  teamToplist.resolveTrophiesWon.mockResolvedValue('team trophies won');

  const playerToplist = mock<PlayerToplistService>();
  playerToplist.resolveMvps.mockResolvedValue('player mvps');
  playerToplist.resolveTouchdownsScored.mockResolvedValue(
    'player touchdowns scored',
  );
  playerToplist.resolveCompletions.mockResolvedValue('player completions');
  playerToplist.resolveInterceptions.mockResolvedValue('player interceptions');
  playerToplist.resolveDeflections.mockResolvedValue('player deflections');
  playerToplist.resolveCasualtiesCaused.mockResolvedValue(
    'player casualties caused',
  );
  playerToplist.resolveCasualtiesSuffered.mockResolvedValue(
    'player casualties suffered',
  );
  playerToplist.resolveSeriousInjuriesCaused.mockResolvedValue(
    'player serious injuries caused',
  );
  playerToplist.resolveSeriousInjuriesSuffered.mockResolvedValue(
    'player serious injuries suffered',
  );
  playerToplist.resolveLastingInjuriesSuffered.mockResolvedValue(
    'player lasting injuries suffered',
  );
  playerToplist.resolveDeathsCaused.mockResolvedValue('player deaths caused');
  playerToplist.resolveFoulsCommitted.mockResolvedValue(
    'player fouls committed',
  );
  playerToplist.resolveTimesSentOff.mockResolvedValue('player times sent off');
  playerToplist.resolveTotalSpp.mockResolvedValue('player total spp');

  const raceToplist = mock<RaceToplistService>();
  raceToplist.resolveTeams.mockResolvedValue('race teams');
  raceToplist.resolveMatchesPlayed.mockResolvedValue('race matches played');
  raceToplist.resolveMatchesWon.mockResolvedValue('race matches won');
  raceToplist.resolveMatchesLost.mockResolvedValue('race matches lost');
  raceToplist.resolveMatchesDrawn.mockResolvedValue('race matches drawn');

  const positionToplist = mock<PositionToplistService>();
  positionToplist.resolvePlayers.mockResolvedValue('position players');

  const expensiveMistakes = mock<ExpensiveMistakesToplistService>();
  expensiveMistakes.resolveTotal.mockResolvedValue('expensive mistakes total');
  expensiveMistakes.resolveBiggest.mockResolvedValue(
    'expensive mistakes biggest',
  );

  const erasList = mock<ErasListService>();
  erasList.resolve.mockResolvedValue('eras list');

  const competitionGroupsList = mock<CompetitionGroupsListService>();
  competitionGroupsList.resolve.mockResolvedValue('competition groups list');

  const statsSummary = mock<StatsSummaryFactsService>();
  statsSummary.resolve.mockResolvedValue('stats summary');

  const starPlayerToplist = mock<StarPlayerToplistService>();
  starPlayerToplist.resolveTotalHires.mockResolvedValue(
    'star players by times hired',
  );
  starPlayerToplist.resolveDistinctTeamsHired.mockResolvedValue(
    'star players by distinct teams hired',
  );

  const starPlayersList = mock<StarPlayersListService>();
  starPlayersList.resolve.mockResolvedValue('star players list');

  const trophiesList = mock<TrophiesListService>();
  trophiesList.resolve.mockResolvedValue('trophies list');

  const onThisDate = mock<OnThisDateFactsService>();
  onThisDate.resolveToday.mockResolvedValue('on this date');

  const dateToplist = mock<DateToplistFactsService>();
  dateToplist.resolveMatchesDescending.mockResolvedValue(
    'dates by matches played descending',
  );
  dateToplist.resolveMatchesAscending.mockResolvedValue(
    'dates by matches played ascending',
  );

  return {
    coachToplist,
    teamToplist,
    playerToplist,
    raceToplist,
    positionToplist,
    expensiveMistakes,
    erasList,
    competitionGroupsList,
    statsSummary,
    starPlayerToplist,
    starPlayersList,
    trophiesList,
    onThisDate,
    dateToplist,
  };
}

describe('buildFactTree', () => {
  it('exposes exactly sixty-three leaf facts', () => {
    expect(factTreeUtils.collectLeaves(buildFactTree(deps()))).toHaveLength(63);
  });

  it('wires coach.toplist.matches.played to CoachToplistService.resolveMatchesPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
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
    ['race.toplist.matches.won', 'raceToplist', 'resolveMatchesWon'],
    ['race.toplist.matches.lost', 'raceToplist', 'resolveMatchesLost'],
    ['race.toplist.matches.drawn', 'raceToplist', 'resolveMatchesDrawn'],
    ['position.toplist.players', 'positionToplist', 'resolvePlayers'],
  ] as const)('wires %s to %s.%s', async (path, dep, method) => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(buildFactTree(d), path);
    await (leaf as FactLeaf).resolve({ leagueId: 9 });
    expect(d[dep][method]).toHaveBeenCalledWith({ leagueId: 9 });
  });

  it('wires coach.toplist.teams to CoachToplistService.resolveTeams', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.teams',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveTeams).toHaveBeenCalled();
  });

  it('wires coach.toplist.competitions.played to CoachToplistService.resolveCompetitionsPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.competitions.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveCompetitionsPlayed).toHaveBeenCalled();
  });

  it('wires coach.toplist.eras.active to CoachToplistService.resolveErasActive', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.eras.active',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveErasActive).toHaveBeenCalled();
  });

  it('wires coach.toplist.fouls.committed to CoachToplistService.resolveFoulsCommitted', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.fouls.committed',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveFoulsCommitted).toHaveBeenCalled();
  });

  it('wires coach.toplist.timeBetweenMatches.longest.descending to CoachToplistService.resolveTimeBetweenMatchesDescending', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.timeBetweenMatches.longest.descending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(
      d.coachToplist.resolveTimeBetweenMatchesDescending,
    ).toHaveBeenCalled();
  });

  it('wires coach.toplist.timeBetweenMatches.longest.ascending to CoachToplistService.resolveTimeBetweenMatchesAscending', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.timeBetweenMatches.longest.ascending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(
      d.coachToplist.resolveTimeBetweenMatchesAscending,
    ).toHaveBeenCalled();
  });

  it('wires coach.toplist.timeBetweenMatches.average to CoachToplistService.resolveAverageTimeBetweenMatches', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.timeBetweenMatches.average',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.coachToplist.resolveAverageTimeBetweenMatches).toHaveBeenCalled();
  });

  it('wires team.toplist.matches.played to TeamToplistService.resolveMatchesPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.matches.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('wires team.toplist.competitions.played to TeamToplistService.resolveCompetitionsPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.competitions.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveCompetitionsPlayed).toHaveBeenCalled();
  });

  it('wires team.toplist.eras.active to TeamToplistService.resolveErasActive', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.eras.active',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveErasActive).toHaveBeenCalled();
  });

  it('wires team.toplist.trophies.won to TeamToplistService.resolveTrophiesWon', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.trophies.won',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    expect(d.teamToplist.resolveTrophiesWon).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });

  it('declares league, era and competition scope but no match category for team.toplist.trophies.won', () => {
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(deps()),
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
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveTouchdownsScored).toHaveBeenCalled();
  });

  it('wires team.toplist.completions to TeamToplistService.resolveCompletions', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.completions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveCompletions).toHaveBeenCalled();
  });

  it('wires team.toplist.interceptions to TeamToplistService.resolveInterceptions', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.interceptions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveInterceptions).toHaveBeenCalled();
  });

  it('wires team.toplist.deflections to TeamToplistService.resolveDeflections', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.deflections',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveDeflections).toHaveBeenCalled();
  });

  it('wires player.toplist.mvps to PlayerToplistService.resolveMvps', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.mvps',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveMvps).toHaveBeenCalled();
  });

  it('wires player.toplist.touchdowns.scored to PlayerToplistService.resolveTouchdownsScored', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveTouchdownsScored).toHaveBeenCalled();
  });

  it('wires player.toplist.completions to PlayerToplistService.resolveCompletions', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.completions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveCompletions).toHaveBeenCalled();
  });

  it('wires player.toplist.interceptions to PlayerToplistService.resolveInterceptions', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.interceptions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveInterceptions).toHaveBeenCalled();
  });

  it('wires player.toplist.deflections to PlayerToplistService.resolveDeflections', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.deflections',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveDeflections).toHaveBeenCalled();
  });

  it('wires team.toplist.casualties.caused to TeamToplistService.resolveCasualtiesCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.casualties.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveCasualtiesCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.serious.caused to TeamToplistService.resolveSeriousInjuriesCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.serious.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveSeriousInjuriesCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.deaths.caused to TeamToplistService.resolveDeathsCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.deaths.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveDeathsCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.casualties.suffered to TeamToplistService.resolveCasualtiesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.casualties.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveCasualtiesSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.serious.suffered to TeamToplistService.resolveSeriousInjuriesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.serious.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveSeriousInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.lasting.suffered to TeamToplistService.resolveLastingInjuriesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.lasting.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveLastingInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.deaths.suffered to TeamToplistService.resolveDeathsSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.deaths.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveDeathsSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.fouls.committed to TeamToplistService.resolveFoulsCommitted', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.fouls.committed',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveFoulsCommitted).toHaveBeenCalled();
  });

  it('wires team.toplist.sent_off to TeamToplistService.resolveTimesSentOff', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.sent_off',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.teamToplist.resolveTimesSentOff).toHaveBeenCalled();
  });

  it('wires team.toplist.expensiveMistakes.total to ExpensiveMistakesToplistService.resolveTotal', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.expensiveMistakes.total',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.expensiveMistakes.resolveTotal).toHaveBeenCalled();
  });

  it('wires team.toplist.expensiveMistakes.biggest to ExpensiveMistakesToplistService.resolveBiggest', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.expensiveMistakes.biggest',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.expensiveMistakes.resolveBiggest).toHaveBeenCalled();
  });

  it('wires player.toplist.casualties.caused to PlayerToplistService.resolveCasualtiesCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.casualties.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveCasualtiesCaused).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.serious.caused to PlayerToplistService.resolveSeriousInjuriesCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.serious.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveSeriousInjuriesCaused).toHaveBeenCalled();
  });

  it('wires player.toplist.deaths.caused to PlayerToplistService.resolveDeathsCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.deaths.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveDeathsCaused).toHaveBeenCalled();
  });

  it('wires player.toplist.casualties.suffered to PlayerToplistService.resolveCasualtiesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.casualties.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveCasualtiesSuffered).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.serious.suffered to PlayerToplistService.resolveSeriousInjuriesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.serious.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveSeriousInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.lasting.suffered to PlayerToplistService.resolveLastingInjuriesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.lasting.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveLastingInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires player.toplist.fouls.committed to PlayerToplistService.resolveFoulsCommitted', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.fouls.committed',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveFoulsCommitted).toHaveBeenCalled();
  });

  it('wires player.toplist.sent_off to PlayerToplistService.resolveTimesSentOff', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.sent_off',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveTimesSentOff).toHaveBeenCalled();
  });

  it('wires player.toplist.totalSpp to PlayerToplistService.resolveTotalSpp', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.totalSpp',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.playerToplist.resolveTotalSpp).toHaveBeenCalled();
  });

  it('wires race.toplist.teams to RaceToplistService.resolveTeams', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'race.toplist.teams',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.raceToplist.resolveTeams).toHaveBeenCalled();
  });

  it('wires race.toplist.matches.played to RaceToplistService.resolveMatchesPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'race.toplist.matches.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.raceToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('wires stats to StatsSummaryFactsService.resolve', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(buildFactTree(d), 'stats');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.statsSummary.resolve).toHaveBeenCalled();
  });

  it('wires eras.list to ErasListService.resolve', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(buildFactTree(d), 'eras.list');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.erasList.resolve).toHaveBeenCalled();
  });

  it('wires trophies.list to TrophiesListService.resolve', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(buildFactTree(d), 'trophies.list');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.trophiesList.resolve).toHaveBeenCalled();
  });

  it('wires competitionGroups.list to CompetitionGroupsListService.resolve', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'competitionGroups.list',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.competitionGroupsList.resolve).toHaveBeenCalled();
  });

  it('wires starPlayers.list to StarPlayersListService.resolve', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'starPlayers.list',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.starPlayersList.resolve).toHaveBeenCalled();
  });

  it('starPlayers.list supports no scoping at all', () => {
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(deps()),
      'starPlayers.list',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(false);
    expect(leaf.supportsEra).toBe(false);
    expect(leaf.supportsCompetition).toBe(false);
    expect(leaf.supportsMatchCategory).toBe(false);
  });

  it('wires starPlayers.toplist.hires.total to StarPlayerToplistService.resolveTotalHires', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'starPlayers.toplist.hires.total',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.starPlayerToplist.resolveTotalHires).toHaveBeenCalled();
  });

  it('starPlayers.toplist.hires.total supports no scoping at all', () => {
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(deps()),
      'starPlayers.toplist.hires.total',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(false);
    expect(leaf.supportsEra).toBe(false);
    expect(leaf.supportsCompetition).toBe(false);
    expect(leaf.supportsMatchCategory).toBe(false);
  });

  it('wires starPlayers.toplist.hires.distinctTeams to StarPlayerToplistService.resolveDistinctTeamsHired', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'starPlayers.toplist.hires.distinctTeams',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.starPlayerToplist.resolveDistinctTeamsHired).toHaveBeenCalled();
    expect(d.starPlayerToplist.resolveTotalHires).not.toHaveBeenCalled();
  });

  it('starPlayers.toplist.hires.distinctTeams supports no scoping at all', () => {
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(deps()),
      'starPlayers.toplist.hires.distinctTeams',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(false);
    expect(leaf.supportsEra).toBe(false);
    expect(leaf.supportsCompetition).toBe(false);
    expect(leaf.supportsMatchCategory).toBe(false);
  });

  it('wires onThisDate to OnThisDateFactsService.resolveToday', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(buildFactTree(d), 'date.onThisDate');
    await (leaf as FactLeaf).resolve({ eraId: 20 });
    expect(d.onThisDate.resolveToday).toHaveBeenCalledWith({ eraId: 20 });
  });

  it('declares all four scopes supported for onThisDate', () => {
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(deps()),
      'date.onThisDate',
    ) as FactLeaf;
    expect(leaf.supportsLeague).toBe(true);
    expect(leaf.supportsEra).toBe(true);
    expect(leaf.supportsCompetition).toBe(true);
    expect(leaf.supportsMatchCategory).toBe(true);
  });

  it('wires date.toplist.matches.descending to DateToplistFactsService.resolveMatchesDescending', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'date.toplist.matches.descending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.dateToplist.resolveMatchesDescending).toHaveBeenCalledWith(
      FACT_SCOPE_ALL_TIME,
    );
  });

  it('wires date.toplist.matches.ascending to DateToplistFactsService.resolveMatchesAscending', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'date.toplist.matches.ascending',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    expect(d.dateToplist.resolveMatchesAscending).toHaveBeenCalledWith(
      FACT_SCOPE_ALL_TIME,
    );
  });

  it('declares all four scopes for both date toplists', () => {
    const tree = buildFactTree(deps());
    for (const path of [
      'date.toplist.matches.descending',
      'date.toplist.matches.ascending',
    ]) {
      const leaf = factTreeUtils.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsLeague).toBe(true);
      expect(leaf.supportsEra).toBe(true);
      expect(leaf.supportsCompetition).toBe(true);
      expect(leaf.supportsMatchCategory).toBe(true);
    }
  });
});

describe('buildFactTree leaf capabilities', () => {
  it('excludes some leaves from era filtering', () => {
    const tree = buildFactTree(deps());
    const unsupported = factTreeUtils
      .collectLeaves(tree)
      .filter((leaf) => !leaf.supportsEra);
    expect(unsupported).toEqual(
      expect.arrayContaining([
        factTreeUtils.resolvePath(tree, 'eras.list'),
        factTreeUtils.resolvePath(tree, 'trophies.list'),
        factTreeUtils.resolvePath(tree, 'competitionGroups.list'),
        factTreeUtils.resolvePath(tree, 'team.toplist.eras.active'),
        factTreeUtils.resolvePath(tree, 'coach.toplist.eras.active'),
        factTreeUtils.resolvePath(tree, 'starPlayers.list'),
        factTreeUtils.resolvePath(tree, 'starPlayers.toplist.hires.total'),
        factTreeUtils.resolvePath(
          tree,
          'starPlayers.toplist.hires.distinctTeams',
        ),
      ]),
    );
    expect(unsupported).toHaveLength(8);
  });
});

describe('buildFactTree league capabilities', () => {
  it('every leaf supports league exactly when it supports era (except the list leaves)', () => {
    const tree = buildFactTree(deps());
    const leaves = factTreeUtils.collectLeaves(tree);
    // eras.list, trophies.list and competitionGroups.list are league-scopable
    // listings that are not themselves era-scopable, so they are the leaves
    // that break the otherwise-universal "league iff era" correspondence.
    // starPlayers.list, starPlayers.toplist.hires.total and
    // starPlayers.toplist.hires.distinctTeams are deliberately NOT in this
    // group: they support neither, so they satisfy the correspondence
    // trivially.
    const listLeaves = [
      factTreeUtils.resolvePath(tree, 'eras.list'),
      factTreeUtils.resolvePath(tree, 'trophies.list'),
      factTreeUtils.resolvePath(tree, 'competitionGroups.list'),
    ];
    for (const leaf of leaves) {
      if (listLeaves.includes(leaf)) {
        expect(leaf.supportsLeague).toBe(true);
        expect(leaf.supportsEra).toBe(false);
      } else {
        expect(leaf.supportsLeague).toBe(leaf.supportsEra);
      }
    }
  });
});

describe('buildFactTree competition capabilities', () => {
  it('includes only the team/player toplists and stats that support competition filtering', () => {
    const tree = buildFactTree(deps());
    const supported = factTreeUtils
      .collectLeaves(tree)
      .filter((leaf) => leaf.supportsCompetition);
    expect(supported).toEqual(
      expect.arrayContaining([
        factTreeUtils.resolvePath(tree, 'team.toplist.trophies.won'),
        factTreeUtils.resolvePath(tree, 'team.toplist.touchdowns.scored'),
        factTreeUtils.resolvePath(tree, 'team.toplist.completions'),
        factTreeUtils.resolvePath(tree, 'team.toplist.interceptions'),
        factTreeUtils.resolvePath(tree, 'team.toplist.deflections'),
        factTreeUtils.resolvePath(tree, 'team.toplist.casualties.caused'),
        factTreeUtils.resolvePath(tree, 'team.toplist.casualties.suffered'),
        factTreeUtils.resolvePath(tree, 'team.toplist.injuries.serious.caused'),
        factTreeUtils.resolvePath(
          tree,
          'team.toplist.injuries.serious.suffered',
        ),
        factTreeUtils.resolvePath(
          tree,
          'team.toplist.injuries.lasting.suffered',
        ),
        factTreeUtils.resolvePath(tree, 'team.toplist.deaths.caused'),
        factTreeUtils.resolvePath(tree, 'team.toplist.deaths.suffered'),
        factTreeUtils.resolvePath(tree, 'team.toplist.fouls.committed'),
        factTreeUtils.resolvePath(tree, 'team.toplist.sent_off'),
        factTreeUtils.resolvePath(tree, 'team.toplist.expensiveMistakes.total'),
        factTreeUtils.resolvePath(
          tree,
          'team.toplist.expensiveMistakes.biggest',
        ),
        factTreeUtils.resolvePath(tree, 'player.toplist.mvps'),
        factTreeUtils.resolvePath(tree, 'player.toplist.touchdowns.scored'),
        factTreeUtils.resolvePath(tree, 'player.toplist.completions'),
        factTreeUtils.resolvePath(tree, 'player.toplist.interceptions'),
        factTreeUtils.resolvePath(tree, 'player.toplist.deflections'),
        factTreeUtils.resolvePath(tree, 'player.toplist.casualties.caused'),
        factTreeUtils.resolvePath(tree, 'player.toplist.casualties.suffered'),
        factTreeUtils.resolvePath(
          tree,
          'player.toplist.injuries.serious.caused',
        ),
        factTreeUtils.resolvePath(
          tree,
          'player.toplist.injuries.serious.suffered',
        ),
        factTreeUtils.resolvePath(
          tree,
          'player.toplist.injuries.lasting.suffered',
        ),
        factTreeUtils.resolvePath(tree, 'player.toplist.deaths.caused'),
        factTreeUtils.resolvePath(tree, 'player.toplist.fouls.committed'),
        factTreeUtils.resolvePath(tree, 'player.toplist.sent_off'),
        factTreeUtils.resolvePath(tree, 'player.toplist.totalSpp'),
        factTreeUtils.resolvePath(tree, 'stats'),
        factTreeUtils.resolvePath(tree, 'date.onThisDate'),
        factTreeUtils.resolvePath(tree, 'date.toplist.matches.ascending'),
        factTreeUtils.resolvePath(tree, 'date.toplist.matches.descending'),
      ]),
    );
    expect(supported).toHaveLength(34);
  });

  it('excludes the coach fouls toplist from competition filtering', () => {
    const tree = buildFactTree(deps());
    const leaf = factTreeUtils.resolvePath(
      tree,
      'coach.toplist.fouls.committed',
    ) as FactLeaf;
    expect(leaf.supportsCompetition).toBe(false);
    expect(leaf.supportsLeague).toBe(true);
    expect(leaf.supportsEra).toBe(true);
  });

  it('scopes the time-between-matches toplists to league and era but not competition', () => {
    const tree = buildFactTree(deps());
    for (const path of [
      'coach.toplist.timeBetweenMatches.longest.descending',
      'coach.toplist.timeBetweenMatches.longest.ascending',
      'coach.toplist.timeBetweenMatches.average',
    ]) {
      const leaf = factTreeUtils.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsLeague).toBe(true);
      expect(leaf.supportsEra).toBe(true);
      expect(leaf.supportsCompetition).toBe(false);
    }
  });

  it('forwards competitionId to an in-scope team leaf', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    expect(d.teamToplist.resolveTouchdownsScored).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });

  it('forwards competitionId to an in-scope player leaf', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.mvps',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    expect(d.playerToplist.resolveMvps).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });

  it('forwards the league and era scope to a time-between-matches leaf', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.timeBetweenMatches.average',
    );
    await (leaf as FactLeaf).resolve({ leagueId: 9, eraId: 20 });
    expect(
      d.coachToplist.resolveAverageTimeBetweenMatches,
    ).toHaveBeenCalledWith({ leagueId: 9, eraId: 20 });
  });
});

describe('buildFactTree match category capabilities', () => {
  it('excludes exactly the thirteen leaves that are not scoped to matches', () => {
    const tree = buildFactTree(deps());
    const unsupported = factTreeUtils
      .collectLeaves(tree)
      .filter((leaf) => !leaf.supportsMatchCategory);
    expect(unsupported).toEqual(
      expect.arrayContaining([
        factTreeUtils.resolvePath(tree, 'coach.toplist.teams'),
        factTreeUtils.resolvePath(tree, 'coach.toplist.eras.active'),
        factTreeUtils.resolvePath(tree, 'team.toplist.eras.active'),
        factTreeUtils.resolvePath(tree, 'team.toplist.trophies.won'),
        factTreeUtils.resolvePath(tree, 'race.toplist.teams'),
        factTreeUtils.resolvePath(tree, 'position.toplist.players'),
        factTreeUtils.resolvePath(tree, 'eras.list'),
        factTreeUtils.resolvePath(tree, 'trophies.list'),
        factTreeUtils.resolvePath(tree, 'competitionGroups.list'),
        factTreeUtils.resolvePath(tree, 'starPlayers.list'),
        factTreeUtils.resolvePath(tree, 'stats'),
        factTreeUtils.resolvePath(tree, 'starPlayers.toplist.hires.total'),
        factTreeUtils.resolvePath(
          tree,
          'starPlayers.toplist.hires.distinctTeams',
        ),
      ]),
    );
    expect(unsupported).toHaveLength(13);
  });

  it('supports the match category on every other leaf', () => {
    const tree = buildFactTree(deps());
    const supported = factTreeUtils
      .collectLeaves(tree)
      .filter((leaf) => leaf.supportsMatchCategory);
    expect(supported).toHaveLength(50);
  });

  it('supports the match category on leaves that do not support a competition', () => {
    const tree = buildFactTree(deps());
    for (const path of [
      'coach.toplist.matches.played',
      'coach.toplist.matches.won',
      'coach.toplist.matches.lost',
      'coach.toplist.matches.drawn',
      'coach.toplist.competitions.played',
      'coach.toplist.fouls.committed',
      'coach.toplist.timeBetweenMatches.average',
      'team.toplist.matches.played',
      'team.toplist.matches.won',
      'team.toplist.matches.lost',
      'team.toplist.matches.drawn',
      'team.toplist.competitions.played',
      'race.toplist.matches.played',
      'race.toplist.matches.won',
      'race.toplist.matches.lost',
      'race.toplist.matches.drawn',
    ]) {
      const leaf = factTreeUtils.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsMatchCategory, path).toBe(true);
      expect(leaf.supportsCompetition, path).toBe(false);
    }
  });

  it('forwards the match category to an in-scope leaf', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve({ category: 'season_final' });
    expect(d.teamToplist.resolveTouchdownsScored).toHaveBeenCalledWith({
      category: 'season_final',
    });
  });
});
