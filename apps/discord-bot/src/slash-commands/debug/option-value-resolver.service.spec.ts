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

import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
} from '../../deepdive/button-custom-ids';
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

  describe('resolveComponentParameters', () => {
    it("resolves a button's id parameter through its prefix's entity type", async () => {
      coaches.findById.mockResolvedValue({ id: 42, name: 'zog' });

      expect(
        await service.resolveComponentParameters(
          COACH_BUTTON_CUSTOM_ID_PREFIX,
          'button',
          [{ key: 'id', value: '42' }],
        ),
      ).toEqual([{ key: 'id', value: 'zog' }]);
      expect(coaches.findById).toHaveBeenCalledWith(42);
    });

    it("resolves a select menu's value parameters, leaving its id parameter untouched", async () => {
      races.findById.mockResolvedValueOnce({ id: 7, name: 'Orc' });
      races.findById.mockResolvedValueOnce({ id: 9, name: 'Human' });

      expect(
        await service.resolveComponentParameters(
          RACE_BUTTON_CUSTOM_ID_PREFIX,
          'select_menu',
          [
            { key: 'id', value: 'menu:0' },
            { key: 'value', value: '7' },
            { key: 'value', value: '9' },
          ],
        ),
      ).toEqual([
        { key: 'id', value: 'menu:0' },
        { key: 'value', value: 'Orc' },
        { key: 'value', value: 'Human' },
      ]);
    });

    it('falls back to the raw value for an unmapped prefix', async () => {
      expect(
        await service.resolveComponentParameters('debug:retrigger:', 'button', [
          { key: 'id', value: '11' },
        ]),
      ).toEqual([{ key: 'id', value: '11' }]);
    });

    it('falls back to the raw value when the entity is gone', async () => {
      coaches.findById.mockResolvedValue(undefined);

      expect(
        await service.resolveComponentParameters(
          COACH_BUTTON_CUSTOM_ID_PREFIX,
          'button',
          [{ key: 'id', value: '42' }],
        ),
      ).toEqual([{ key: 'id', value: '42' }]);
    });

    it('passes a null parameter value through untouched', async () => {
      expect(
        await service.resolveComponentParameters(
          COACH_BUTTON_CUSTOM_ID_PREFIX,
          'button',
          [{ key: 'id', value: null }],
        ),
      ).toEqual([{ key: 'id', value: null }]);
      expect(coaches.findById).not.toHaveBeenCalled();
    });
  });
});
