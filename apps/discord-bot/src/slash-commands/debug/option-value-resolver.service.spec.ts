import {
  CoachesService,
  CompetitionGroupsService,
  CompetitionsService,
  ErasService,
  LeaguesService,
  PlayersService,
  PositionsService,
  RacesService,
  StarPlayersService,
  TeamsService,
  TrophiesService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep } from 'vitest-mock-extended';

import { OptionValueResolverService } from './option-value-resolver.service';

describe('OptionValueResolverService', () => {
  let service: OptionValueResolverService;
  let races: DeepMockProxy<RacesService>;
  let eras: DeepMockProxy<ErasService>;
  let leagues: DeepMockProxy<LeaguesService>;
  let competitions: DeepMockProxy<CompetitionsService>;
  let competitionGroups: DeepMockProxy<CompetitionGroupsService>;
  let coaches: DeepMockProxy<CoachesService>;
  let teams: DeepMockProxy<TeamsService>;
  let players: DeepMockProxy<PlayersService>;
  let starPlayers: DeepMockProxy<StarPlayersService>;
  let positions: DeepMockProxy<PositionsService>;
  let trophies: DeepMockProxy<TrophiesService>;

  beforeEach(async () => {
    races = mockDeep<RacesService>();
    eras = mockDeep<ErasService>();
    leagues = mockDeep<LeaguesService>();
    competitions = mockDeep<CompetitionsService>();
    competitionGroups = mockDeep<CompetitionGroupsService>();
    coaches = mockDeep<CoachesService>();
    teams = mockDeep<TeamsService>();
    players = mockDeep<PlayersService>();
    starPlayers = mockDeep<StarPlayersService>();
    positions = mockDeep<PositionsService>();
    trophies = mockDeep<TrophiesService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OptionValueResolverService,
        { provide: RacesService, useValue: races },
        { provide: ErasService, useValue: eras },
        { provide: LeaguesService, useValue: leagues },
        { provide: CompetitionsService, useValue: competitions },
        { provide: CompetitionGroupsService, useValue: competitionGroups },
        { provide: CoachesService, useValue: coaches },
        { provide: TeamsService, useValue: teams },
        { provide: PlayersService, useValue: players },
        { provide: StarPlayersService, useValue: starPlayers },
        { provide: PositionsService, useValue: positions },
        { provide: TrophiesService, useValue: trophies },
      ],
    }).compile();
    service = moduleRef.get(OptionValueResolverService);
  });

  it('resolves a race id to its name', async () => {
    races.findById.mockResolvedValue({ id: 17, name: 'Orc' });

    expect(await service.resolve('race', '17')).toBe('Orc');
    expect(races.findById).toHaveBeenCalledWith(17);
  });

  it('resolves a competition group through its league-joined lookup', async () => {
    competitionGroups.findByIdWithLeague.mockResolvedValue({
      id: 3,
      name: 'Spring Cup',
      leagueId: 1,
      leagueName: 'Test League',
    });

    expect(await service.resolve('competition-group', '3')).toBe('Spring Cup');
    expect(competitionGroups.findByIdWithLeague).toHaveBeenCalledWith(3);
  });

  it('falls back to the raw value for an unmapped key', async () => {
    expect(await service.resolve('match-category', 'league')).toBe('league');
  });

  it('falls back to the raw value when the entity is gone', async () => {
    races.findById.mockResolvedValue(undefined);

    expect(await service.resolve('race', '17')).toBe('17');
  });

  it('falls back to the raw value when it is not an integer id', async () => {
    expect(await service.resolve('race', 'Orc')).toBe('Orc');
    expect(races.findById).not.toHaveBeenCalled();
  });

  it('resolves every parameter in a row, keeping order and keys', async () => {
    races.findById.mockResolvedValue({ id: 17, name: 'Orc' });
    eras.findById.mockResolvedValue({
      id: 2,
      name: 'Classic',
      startDate: '2020-01-01',
      endDate: null,
    });

    expect(
      await service.resolveParameters([
        { key: 'race', value: '17' },
        { key: 'era', value: '2' },
        { key: 'category', value: 'kills' },
      ]),
    ).toEqual([
      { key: 'race', value: 'Orc' },
      { key: 'era', value: 'Classic' },
      { key: 'category', value: 'kills' },
    ]);
  });

  it('falls back to the raw value when the lookup rejects', async () => {
    races.findById.mockRejectedValue(new Error('db gone'));

    expect(await service.resolve('race', '17')).toBe('17');
  });

  it('passes a null parameter value through untouched', async () => {
    expect(
      await service.resolveParameters([{ key: 'race', value: null }]),
    ).toEqual([{ key: 'race', value: null }]);
    expect(races.findById).not.toHaveBeenCalled();
  });
});
