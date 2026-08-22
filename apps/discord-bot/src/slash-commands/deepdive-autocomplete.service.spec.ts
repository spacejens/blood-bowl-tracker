import {
  CoachesService,
  CompetitionGroupsService,
  CompetitionsService,
  ErasService,
  LeaguesService,
  PlayersService,
  RacesService,
  StarPlayersService,
  TeamsService,
  TrophiesService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import type { AutocompleteInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DeepdiveAutocompleteService } from './deepdive-autocomplete.service';

interface MadeService {
  service: DeepdiveAutocompleteService;
  eras: MockProxy<ErasService>;
  competitions: MockProxy<CompetitionsService>;
  competitionGroups: MockProxy<CompetitionGroupsService>;
  coaches: MockProxy<CoachesService>;
  teams: MockProxy<TeamsService>;
  players: MockProxy<PlayersService>;
  races: MockProxy<RacesService>;
  stars: MockProxy<StarPlayersService>;
  trophies: MockProxy<TrophiesService>;
  leagues: MockProxy<LeaguesService>;
}

async function makeService(): Promise<MadeService> {
  const eras = mock<ErasService>();
  const competitions = mock<CompetitionsService>();
  const competitionGroups = mock<CompetitionGroupsService>();
  const coaches = mock<CoachesService>();
  const teams = mock<TeamsService>();
  const players = mock<PlayersService>();
  const races = mock<RacesService>();
  const stars = mock<StarPlayersService>();
  const trophies = mock<TrophiesService>();
  const leagues = mock<LeaguesService>();

  const moduleRef = await Test.createTestingModule({
    providers: [
      DeepdiveAutocompleteService,
      { provide: ErasService, useValue: eras },
      { provide: CompetitionsService, useValue: competitions },
      { provide: CompetitionGroupsService, useValue: competitionGroups },
      { provide: CoachesService, useValue: coaches },
      { provide: TeamsService, useValue: teams },
      { provide: PlayersService, useValue: players },
      { provide: RacesService, useValue: races },
      { provide: StarPlayersService, useValue: stars },
      { provide: TrophiesService, useValue: trophies },
      { provide: LeaguesService, useValue: leagues },
    ],
  }).compile();

  return {
    service: moduleRef.get(DeepdiveAutocompleteService),
    eras,
    competitions,
    competitionGroups,
    coaches,
    teams,
    players,
    races,
    stars,
    trophies,
    leagues,
  };
}

function autocompleteInteraction(
  value: string,
  name:
    | 'era'
    | 'coach'
    | 'team'
    | 'player'
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
  it('returns era choices labelled "<name> (<league>)" with id values', async () => {
    const { service, eras } = await makeService();
    eras.searchByNamePrefix.mockResolvedValue([
      { id: 3, name: 'BB2020', leagueName: 'Premier League' },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('bb')),
    ).resolves.toEqual([{ name: 'BB2020 (Premier League)', value: '3' }]);
    expect(eras.searchByNamePrefix).toHaveBeenCalledWith('bb', 25);
  });

  it('returns coach choices labelled "<name> (#<id>)" with id values', async () => {
    const { service, coaches } = await makeService();
    coaches.searchByNamePrefix.mockResolvedValue([{ id: 5, name: 'Roze-El' }]);

    await expect(
      service.resolve(autocompleteInteraction('ro', 'coach')),
    ).resolves.toEqual([{ name: 'Roze-El (#5)', value: '5' }]);
  });

  it('returns team choices labelled "<name> (#<id>)" with id values', async () => {
    const { service, teams } = await makeService();
    teams.searchByNamePrefix.mockResolvedValue([{ id: 8, name: '40 Thieves' }]);

    await expect(
      service.resolve(autocompleteInteraction('40', 'team')),
    ).resolves.toEqual([{ name: '40 Thieves (#8)', value: '8' }]);
  });

  it('returns player choices labelled "<name> (<team>)" with id values', async () => {
    const { service, players } = await makeService();
    players.searchByNamePrefix.mockResolvedValue([
      { id: 9, name: 'Griff', teamName: 'Reikland Reavers' },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('gri', 'player')),
    ).resolves.toEqual([{ name: 'Griff (Reikland Reavers)', value: '9' }]);
  });

  it('returns race choices labelled by plain name with id values', async () => {
    const { service, races } = await makeService();
    races.searchByNamePrefix.mockResolvedValue([{ id: 4, name: 'Orc' }]);

    await expect(
      service.resolve(autocompleteInteraction('or', 'race')),
    ).resolves.toEqual([{ name: 'Orc', value: '4' }]);
  });

  it('returns competition choices labelled "<name> (<league>)" with id values', async () => {
    const { service, competitions } = await makeService();
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
    const { service, trophies } = await makeService();
    trophies.searchByNamePrefix.mockResolvedValue([
      { id: 7, name: 'Chaos Cup', competitionGroupName: 'Major' },
    ]);

    await expect(
      service.resolve(autocompleteInteraction('cha', 'trophy')),
    ).resolves.toEqual([{ name: 'Chaos Cup (Major)', value: '7' }]);
    expect(trophies.searchByNamePrefix).toHaveBeenCalledWith('cha', 25);
  });

  it('returns competition group choices labelled "<name> (<league>)" with id values', async () => {
    const { service, competitionGroups } = await makeService();
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
    const { service, stars } = await makeService();
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
    const { service, leagues } = await makeService();
    leagues.searchByNamePrefix.mockResolvedValue([{ id: 7, name: 'tLoEG' }]);

    await expect(
      service.resolve(autocompleteInteraction('tL', 'league')),
    ).resolves.toEqual([{ name: 'tLoEG', value: '7' }]);
    expect(leagues.searchByNamePrefix).toHaveBeenCalledWith('tL', 25);
  });

  it('returns no choices for an option it does not handle', async () => {
    const { service } = await makeService();

    await expect(
      service.resolve(
        autocompleteInteraction('x', 'unknown' as unknown as 'era'),
      ),
    ).resolves.toEqual([]);
  });
});
