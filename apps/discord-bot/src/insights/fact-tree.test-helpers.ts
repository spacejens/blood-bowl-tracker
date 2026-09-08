import { mock } from 'vitest-mock-extended';

import type { FactTreeDeps } from './fact-tree.types';
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

export function deps(): FactTreeDeps {
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
  coachToplist.resolveTrophiesWon.mockResolvedValue('coach trophies won');
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
  raceToplist.resolveTeamsDescending.mockResolvedValue('race teams descending');
  raceToplist.resolveTeamsAscending.mockResolvedValue('race teams ascending');
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
