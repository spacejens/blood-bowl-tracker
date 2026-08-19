import { Test } from '@nestjs/testing';
import type { InteractionReplyOptions } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { CompetitionGroupDeepdiveService } from '../deepdive/facts/competition-group-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import { TrophyDeepdiveService } from '../deepdive/facts/trophy-deepdive.service';
import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
} from '../error-messages';
import { DeepdiveTargetResolverService } from './deepdive-target-resolver.service';

interface MadeService {
  service: DeepdiveTargetResolverService;
  eraDeepdive: MockProxy<EraDeepdiveService>;
  coachDeepdive: MockProxy<CoachDeepdiveService>;
  teamDeepdive: MockProxy<TeamDeepdiveService>;
  playerDeepdive: MockProxy<PlayerDeepdiveService>;
  raceDeepdive: MockProxy<RaceDeepdiveService>;
  competitionDeepdive: MockProxy<CompetitionDeepdiveService>;
  competitionGroupDeepdive: MockProxy<CompetitionGroupDeepdiveService>;
  trophyDeepdive: MockProxy<TrophyDeepdiveService>;
}

async function makeService(): Promise<MadeService> {
  const eraDeepdive = mock<EraDeepdiveService>();
  const coachDeepdive = mock<CoachDeepdiveService>();
  const teamDeepdive = mock<TeamDeepdiveService>();
  const playerDeepdive = mock<PlayerDeepdiveService>();
  const raceDeepdive = mock<RaceDeepdiveService>();
  const competitionDeepdive = mock<CompetitionDeepdiveService>();
  const competitionGroupDeepdive = mock<CompetitionGroupDeepdiveService>();
  const trophyDeepdive = mock<TrophyDeepdiveService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      DeepdiveTargetResolverService,
      { provide: EraDeepdiveService, useValue: eraDeepdive },
      { provide: CoachDeepdiveService, useValue: coachDeepdive },
      { provide: TeamDeepdiveService, useValue: teamDeepdive },
      { provide: PlayerDeepdiveService, useValue: playerDeepdive },
      { provide: RaceDeepdiveService, useValue: raceDeepdive },
      { provide: CompetitionDeepdiveService, useValue: competitionDeepdive },
      {
        provide: CompetitionGroupDeepdiveService,
        useValue: competitionGroupDeepdive,
      },
      { provide: TrophyDeepdiveService, useValue: trophyDeepdive },
    ],
  }).compile();
  return {
    service: moduleRef.get(DeepdiveTargetResolverService),
    eraDeepdive,
    coachDeepdive,
    teamDeepdive,
    playerDeepdive,
    raceDeepdive,
    competitionDeepdive,
    competitionGroupDeepdive,
    trophyDeepdive,
  };
}

const embed: InteractionReplyOptions = { embeds: [{ title: 'x' }] };

describe('DeepdiveTargetResolverService', () => {
  it('forwards a parsed integer era id to the era deepdive', async () => {
    const { service, eraDeepdive } = await makeService();
    eraDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveEra('42')).toBe(embed);
    expect(eraDeepdive.resolve).toHaveBeenCalledWith(42);
  });

  it('rejects a non-integer era id without hitting the deepdive', async () => {
    const { service, eraDeepdive } = await makeService();
    expect(await service.resolveEra('abc')).toBe(
      DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
    );
    expect(eraDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer coach id to the coach deepdive', async () => {
    const { service, coachDeepdive } = await makeService();
    coachDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveCoach('7')).toBe(embed);
    expect(coachDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('rejects a non-integer coach id without hitting the deepdive', async () => {
    const { service, coachDeepdive } = await makeService();
    expect(await service.resolveCoach('1.5')).toBe(
      DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
    );
    expect(coachDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer team id to the team deepdive', async () => {
    const { service, teamDeepdive } = await makeService();
    teamDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveTeam('3')).toBe(embed);
    expect(teamDeepdive.resolve).toHaveBeenCalledWith(3);
  });

  it('rejects a non-integer team id without hitting the deepdive', async () => {
    const { service, teamDeepdive } = await makeService();
    expect(await service.resolveTeam('3.5')).toBe(
      DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
    );
    expect(teamDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer player id to the player deepdive', async () => {
    const { service, playerDeepdive } = await makeService();
    playerDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolvePlayer('9')).toBe(embed);
    expect(playerDeepdive.resolve).toHaveBeenCalledWith(9);
  });

  it('rejects a non-integer player id without hitting the deepdive', async () => {
    const { service, playerDeepdive } = await makeService();
    expect(await service.resolvePlayer('x')).toBe(
      DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
    );
    expect(playerDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer race id to the race deepdive', async () => {
    const { service, raceDeepdive } = await makeService();
    raceDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveRace('5')).toBe(embed);
    expect(raceDeepdive.resolve).toHaveBeenCalledWith(5);
  });

  it('rejects a non-integer race id without hitting the deepdive', async () => {
    const { service, raceDeepdive } = await makeService();
    expect(await service.resolveRace('y')).toBe(
      DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
    );
    expect(raceDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer competition id to the competition deepdive', async () => {
    const { service, competitionDeepdive } = await makeService();
    competitionDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveCompetition('11')).toBe(embed);
    expect(competitionDeepdive.resolve).toHaveBeenCalledWith(11);
  });

  it('rejects a non-integer competition id without hitting the deepdive', async () => {
    const { service, competitionDeepdive } = await makeService();
    expect(await service.resolveCompetition('z')).toBe(
      DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
    );
    expect(competitionDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer trophy id to the trophy deepdive', async () => {
    const { service, trophyDeepdive } = await makeService();
    trophyDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveTrophy('13')).toBe(embed);
    expect(trophyDeepdive.resolve).toHaveBeenCalledWith(13);
  });

  it('rejects a non-integer trophy id without hitting the deepdive', async () => {
    const { service, trophyDeepdive } = await makeService();
    expect(await service.resolveTrophy('q')).toBe(
      DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
    );
    expect(trophyDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards a parsed integer competition group id to its deepdive', async () => {
    const { service, competitionGroupDeepdive } = await makeService();
    competitionGroupDeepdive.resolve.mockResolvedValue(embed);
    expect(await service.resolveCompetitionGroup('17')).toBe(embed);
    expect(competitionGroupDeepdive.resolve).toHaveBeenCalledWith(17);
  });

  it('rejects a non-integer competition group id without hitting the deepdive', async () => {
    const { service, competitionGroupDeepdive } = await makeService();
    expect(await service.resolveCompetitionGroup('w')).toBe(
      DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
    );
    expect(competitionGroupDeepdive.resolve).not.toHaveBeenCalled();
  });
});
