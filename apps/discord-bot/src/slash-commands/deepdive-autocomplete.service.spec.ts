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
import type { AutocompleteInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DeepdiveAutocompleteService } from './deepdive-autocomplete.service';

function autocompleteInteraction(
  value: string,
  name:
    | 'era'
    | 'coach'
    | 'team'
    | 'player'
    | 'position'
    | 'race'
    | 'competition'
    | 'competition-group'
    | 'star-player'
    | 'trophy'
    | 'league' = 'era',
): AutocompleteInteraction {
  return {
    options: {
      getFocused: vi.fn((full?: boolean) =>
        full ? { name, value, type: 3, focused: true } : value,
      ),
    },
  } as unknown as AutocompleteInteraction;
}

describe('DeepdiveAutocompleteService', () => {
  let service: DeepdiveAutocompleteService;
  let eras: MockProxy<ErasService>;
  let competitions: MockProxy<CompetitionsService>;
  let competitionGroups: MockProxy<CompetitionGroupsService>;
  let coaches: MockProxy<CoachesService>;
  let teams: MockProxy<TeamsService>;
  let players: MockProxy<PlayersService>;
  let positions: MockProxy<PositionsService>;
  let races: MockProxy<RacesService>;
  let stars: MockProxy<StarPlayersService>;
  let trophies: MockProxy<TrophiesService>;
  let leagues: MockProxy<LeaguesService>;

  beforeEach(async () => {
    eras = mock<ErasService>();
    competitions = mock<CompetitionsService>();
    competitionGroups = mock<CompetitionGroupsService>();
    coaches = mock<CoachesService>();
    teams = mock<TeamsService>();
    players = mock<PlayersService>();
    positions = mock<PositionsService>();
    races = mock<RacesService>();
    stars = mock<StarPlayersService>();
    trophies = mock<TrophiesService>();
    leagues = mock<LeaguesService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeepdiveAutocompleteService,
        { provide: ErasService, useValue: eras },
        { provide: CompetitionsService, useValue: competitions },
        { provide: CompetitionGroupsService, useValue: competitionGroups },
        { provide: CoachesService, useValue: coaches },
        { provide: TeamsService, useValue: teams },
        { provide: PlayersService, useValue: players },
        { provide: PositionsService, useValue: positions },
        { provide: RacesService, useValue: races },
        { provide: StarPlayersService, useValue: stars },
        { provide: TrophiesService, useValue: trophies },
        { provide: LeaguesService, useValue: leagues },
      ],
    }).compile();
    service = moduleRef.get(DeepdiveAutocompleteService);
  });

  it('returns era choices labelled "<name> (<league>)" with id values', async () => {
    eras.searchByNamePrefix.mockResolvedValue([
      { id: 3, name: 'BB2020', leagueName: 'Premier League' },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('bb')),
    ).resolves.toEqual([{ name: 'BB2020 (Premier League)', value: '3' }]);
    expect(eras.searchByNamePrefix).toHaveBeenCalledWith('bb', 25);
  });

  it('returns coach choices labelled "<name> (#<id>)" with id values', async () => {
    coaches.searchByNamePrefix.mockResolvedValue([{ id: 5, name: 'Roze-El' }]);

    await expect(
      service.resolve(autocompleteInteraction('ro', 'coach')),
    ).resolves.toEqual([{ name: 'Roze-El (#5)', value: '5' }]);
  });

  it('returns team choices labelled "<name> (#<id>)" with id values', async () => {
    teams.searchByNamePrefix.mockResolvedValue([{ id: 8, name: '40 Thieves' }]);

    await expect(
      service.resolve(autocompleteInteraction('40', 'team')),
    ).resolves.toEqual([{ name: '40 Thieves (#8)', value: '8' }]);
  });

  it('returns player choices labelled "<name> (<team>)" with id values', async () => {
    players.searchByNamePrefix.mockResolvedValue([
      { id: 9, name: 'Griff', teamName: 'Reikland Reavers' },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('gri', 'player')),
    ).resolves.toEqual([{ name: 'Griff (Reikland Reavers)', value: '9' }]);
  });

  it('returns race choices labelled by plain name with id values', async () => {
    races.searchByNamePrefix.mockResolvedValue([{ id: 4, name: 'Orc' }]);

    await expect(
      service.resolve(autocompleteInteraction('or', 'race')),
    ).resolves.toEqual([{ name: 'Orc', value: '4' }]);
  });

  it('returns position choices labelled "<name> (<race>)" with the position id as the value', async () => {
    positions.searchByNamePrefixWithRace.mockResolvedValue([
      { id: 4, name: 'Blitzer', raceName: 'Human' },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('Bl', 'position')),
    ).resolves.toEqual([{ name: 'Blitzer (Human)', value: '4' }]);
    expect(positions.searchByNamePrefixWithRace).toHaveBeenCalledWith('Bl', 25);
  });

  it('offers one position suggestion per race, all pointing at the same position id', async () => {
    // A position available to several races (typically a star) fans out to
    // one suggestion per race. Sharing the value is correct: the position
    // deepdive shows every race the position belongs to regardless of which
    // suggestion was picked.
    positions.searchByNamePrefixWithRace.mockResolvedValue([
      { id: 9, name: 'Morg N Thorg', raceName: 'Human' },
      { id: 9, name: 'Morg N Thorg', raceName: 'Orc' },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('Mor', 'position')),
    ).resolves.toEqual([
      { name: 'Morg N Thorg (Human)', value: '9' },
      { name: 'Morg N Thorg (Orc)', value: '9' },
    ]);
  });

  it('returns competition choices labelled "<name> (<league>)" with id values', async () => {
    competitions.searchByNamePrefix.mockResolvedValue([
      { id: 6, name: 'Major Season 24', leagueName: 'Premier League' },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('maj', 'competition')),
    ).resolves.toEqual([
      { name: 'Major Season 24 (Premier League)', value: '6' },
    ]);
  });

  it('returns trophy choices labelled "<name> (<competition group>)" with id values', async () => {
    trophies.searchByNamePrefix.mockResolvedValue([
      {
        id: 7,
        name: 'Chaos Cup',
        competitionGroupId: 4,
        competitionGroupName: 'Major',
        leagueName: null,
      },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('cha', 'trophy')),
    ).resolves.toEqual([{ name: 'Chaos Cup (Major)', value: '7' }]);
    expect(trophies.searchByNamePrefix).toHaveBeenCalledWith('cha', 25);
  });

  it('labels a league-scoped trophy with its league', async () => {
    trophies.searchByNamePrefix.mockResolvedValue([
      {
        id: 3,
        name: 'Legendary Player',
        competitionGroupId: null,
        competitionGroupName: null,
        leagueName: 'tLoEG',
      },
    ]);
    const interaction = autocompleteInteraction('Leg', 'trophy');

    expect(await service.resolve(interaction)).toEqual([
      { name: 'Legendary Player (tLoEG)', value: '3' },
    ]);
  });

  it('returns competition group choices labelled "<name> (<league>)" with id values', async () => {
    competitionGroups.searchByNamePrefix.mockResolvedValue([
      { id: 4, name: 'Chaos Cup', leagueName: 'The Major' },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('cha', 'competition-group')),
    ).resolves.toEqual([{ name: 'Chaos Cup (The Major)', value: '4' }]);
    expect(competitionGroups.searchByNamePrefix).toHaveBeenCalledWith(
      'cha',
      25,
    );
  });

  it('offers star player choices by name for the star-player option', async () => {
    stars.searchByNamePrefix.mockResolvedValue([
      { positionId: 20, name: 'Griff Oberwald' },
      { positionId: 21, name: 'Grim Ironjaw' },
    ]);

    const result = await service.resolve(
      autocompleteInteraction('Gri', 'star-player'),
    );

    expect(stars.searchByNamePrefix).toHaveBeenCalledWith('Gri', 25);
    expect(result).toEqual([
      { name: 'Griff Oberwald', value: '20' },
      { name: 'Grim Ironjaw', value: '21' },
    ]);
  });

  it('autocompletes leagues by name prefix', async () => {
    leagues.searchByNamePrefix.mockResolvedValue([{ id: 7, name: 'tLoEG' }]);

    await expect(
      service.resolve(autocompleteInteraction('tL', 'league')),
    ).resolves.toEqual([{ name: 'tLoEG', value: '7' }]);
    expect(leagues.searchByNamePrefix).toHaveBeenCalledWith('tL', 25);
  });

  it('returns no choices for an option it does not handle', async () => {
    await expect(
      service.resolve(
        autocompleteInteraction('x', 'unknown' as unknown as 'era'),
      ),
    ).resolves.toEqual([]);
  });
});
