import { Test } from '@nestjs/testing';
import type { InteractionReplyOptions } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { CompetitionGroupDeepdiveService } from '../deepdive/facts/competition-group-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { LeagueDeepdiveService } from '../deepdive/facts/league-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { PositionDeepdiveService } from '../deepdive/facts/position-deepdive.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { StarPlayerDeepdiveService } from '../deepdive/facts/star-player-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import { TrophyDeepdiveService } from '../deepdive/facts/trophy-deepdive.service';
import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_LEAGUE_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_POSITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
} from '../error-messages';
import { DeepdiveTargetResolverService } from './deepdive-target-resolver.service';

const embed: InteractionReplyOptions = { embeds: [{ title: 'x' }] };

describe('DeepdiveTargetResolverService', () => {
  let service: DeepdiveTargetResolverService;
  let eraDeepdive: MockProxy<EraDeepdiveService>;
  let coachDeepdive: MockProxy<CoachDeepdiveService>;
  let teamDeepdive: MockProxy<TeamDeepdiveService>;
  let playerDeepdive: MockProxy<PlayerDeepdiveService>;
  let positionDeepdive: MockProxy<PositionDeepdiveService>;
  let raceDeepdive: MockProxy<RaceDeepdiveService>;
  let competitionDeepdive: MockProxy<CompetitionDeepdiveService>;
  let competitionGroupDeepdive: MockProxy<CompetitionGroupDeepdiveService>;
  let trophyDeepdive: MockProxy<TrophyDeepdiveService>;
  let starPlayerDeepdive: MockProxy<StarPlayerDeepdiveService>;
  let leagueDeepdive: MockProxy<LeagueDeepdiveService>;

  beforeEach(async () => {
    eraDeepdive = mock<EraDeepdiveService>();
    coachDeepdive = mock<CoachDeepdiveService>();
    teamDeepdive = mock<TeamDeepdiveService>();
    playerDeepdive = mock<PlayerDeepdiveService>();
    positionDeepdive = mock<PositionDeepdiveService>();
    raceDeepdive = mock<RaceDeepdiveService>();
    competitionDeepdive = mock<CompetitionDeepdiveService>();
    competitionGroupDeepdive = mock<CompetitionGroupDeepdiveService>();
    trophyDeepdive = mock<TrophyDeepdiveService>();
    starPlayerDeepdive = mock<StarPlayerDeepdiveService>();
    leagueDeepdive = mock<LeagueDeepdiveService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeepdiveTargetResolverService,
        { provide: EraDeepdiveService, useValue: eraDeepdive },
        { provide: CoachDeepdiveService, useValue: coachDeepdive },
        { provide: TeamDeepdiveService, useValue: teamDeepdive },
        { provide: PlayerDeepdiveService, useValue: playerDeepdive },
        { provide: PositionDeepdiveService, useValue: positionDeepdive },
        { provide: RaceDeepdiveService, useValue: raceDeepdive },
        { provide: CompetitionDeepdiveService, useValue: competitionDeepdive },
        {
          provide: CompetitionGroupDeepdiveService,
          useValue: competitionGroupDeepdive,
        },
        { provide: TrophyDeepdiveService, useValue: trophyDeepdive },
        { provide: StarPlayerDeepdiveService, useValue: starPlayerDeepdive },
        { provide: LeagueDeepdiveService, useValue: leagueDeepdive },
      ],
    }).compile();
    service = moduleRef.get(DeepdiveTargetResolverService);
  });

  it('forwards a parsed integer era id to the era deepdive', async () => {
    eraDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveEra('42')).toBe(embed);
    expect(eraDeepdive.resolve).toHaveBeenCalledWith(42);
  });

  it('rejects a non-integer era id without hitting the deepdive', async () => {
    expect(await service.resolveEra('abc')).toBe(
      DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
    );
    expect(eraDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer coach id to the coach deepdive', async () => {
    coachDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveCoach('7')).toBe(embed);
    expect(coachDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('rejects a non-integer coach id without hitting the deepdive', async () => {
    expect(await service.resolveCoach('1.5')).toBe(
      DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
    );
    expect(coachDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer team id to the team deepdive', async () => {
    teamDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveTeam('3')).toBe(embed);
    expect(teamDeepdive.resolve).toHaveBeenCalledWith(3);
  });

  it('rejects a non-integer team id without hitting the deepdive', async () => {
    expect(await service.resolveTeam('3.5')).toBe(
      DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
    );
    expect(teamDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer player id to the player deepdive', async () => {
    playerDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolvePlayer('9')).toBe(embed);
    expect(playerDeepdive.resolve).toHaveBeenCalledWith(9);
  });

  it('rejects a non-integer player id without hitting the deepdive', async () => {
    expect(await service.resolvePlayer('x')).toBe(
      DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
    );
    expect(playerDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer race id to the race deepdive', async () => {
    raceDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveRace('5')).toBe(embed);
    expect(raceDeepdive.resolve).toHaveBeenCalledWith(5);
  });

  it('rejects a non-integer race id without hitting the deepdive', async () => {
    expect(await service.resolveRace('y')).toBe(
      DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
    );
    expect(raceDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer competition id to the competition deepdive', async () => {
    competitionDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveCompetition('11')).toBe(embed);
    expect(competitionDeepdive.resolve).toHaveBeenCalledWith(11);
  });

  it('rejects a non-integer competition id without hitting the deepdive', async () => {
    expect(await service.resolveCompetition('z')).toBe(
      DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
    );
    expect(competitionDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer trophy id to the trophy deepdive', async () => {
    trophyDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveTrophy('13')).toBe(embed);
    expect(trophyDeepdive.resolve).toHaveBeenCalledWith(13);
  });

  it('rejects a non-integer trophy id without hitting the deepdive', async () => {
    expect(await service.resolveTrophy('q')).toBe(
      DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
    );
    expect(trophyDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer competition group id to its deepdive', async () => {
    competitionGroupDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveCompetitionGroup('17')).toBe(embed);
    expect(competitionGroupDeepdive.resolve).toHaveBeenCalledWith(17);
  });

  it('rejects a non-integer competition group id without hitting the deepdive', async () => {
    expect(await service.resolveCompetitionGroup('w')).toBe(
      DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
    );
    expect(competitionGroupDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer position id to the star player deepdive', async () => {
    starPlayerDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveStarPlayer('20')).toBe(embed);
    expect(starPlayerDeepdive.resolve).toHaveBeenCalledWith(20);
  });

  it('rejects a non-integer star player id without hitting the deepdive', async () => {
    expect(await service.resolveStarPlayer('Griff')).toBe(
      DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
    );
    expect(starPlayerDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('delegates a numeric position value to the position deepdive', async () => {
    positionDeepdive.resolve.mockResolvedValue('rendered');

    await expect(service.resolvePosition('4')).resolves.toBe('rendered');
    expect(positionDeepdive.resolve).toHaveBeenCalledWith(4);
  });

  it('returns the not-found message for a non-integer position value', async () => {
    await expect(service.resolvePosition('nope')).resolves.toBe(
      DEEPDIVE_POSITION_NOT_FOUND_MESSAGE,
    );
    expect(positionDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('resolves a league target by id', async () => {
    leagueDeepdive.resolve.mockResolvedValue('league reply');
    expect(await service.resolveLeague('7')).toBe('league reply');
    expect(leagueDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('rejects a non-integer league id', async () => {
    expect(await service.resolveLeague('abc')).toBe(
      DEEPDIVE_LEAGUE_NOT_FOUND_MESSAGE,
    );
  });
});
