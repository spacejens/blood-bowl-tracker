import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import {
  CoachesService,
  CompetitionsService,
  ErasService,
  PlayersService,
  RacesService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_MULTIPLE_TARGETS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_USAGE_MESSAGE,
} from '../error-messages';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  DeepdiveCommandService,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from './deepdive-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

interface MadeService {
  service: DeepdiveCommandService;
  eras: MockProxy<ErasService>;
  competitions: MockProxy<CompetitionsService>;
  coaches: MockProxy<CoachesService>;
  teams: MockProxy<TeamsService>;
  players: MockProxy<PlayersService>;
  races: MockProxy<RacesService>;
  discordClient: MockProxy<DiscordClientService>;
  registry: MockProxy<SlashCommandRegistryService>;
  eraDeepdive: MockProxy<EraDeepdiveService>;
  coachDeepdive: MockProxy<CoachDeepdiveService>;
  teamDeepdive: MockProxy<TeamDeepdiveService>;
  playerDeepdive: MockProxy<PlayerDeepdiveService>;
  raceDeepdive: MockProxy<RaceDeepdiveService>;
  competitionDeepdive: MockProxy<CompetitionDeepdiveService>;
}

async function makeService(): Promise<MadeService> {
  const eras = mock<ErasService>();
  const competitions = mock<CompetitionsService>();
  const coaches = mock<CoachesService>();
  const teams = mock<TeamsService>();
  const players = mock<PlayersService>();
  const races = mock<RacesService>();
  const discordClient = mock<DiscordClientService>();
  const registry = mock<SlashCommandRegistryService>();
  const eraDeepdive = mock<EraDeepdiveService>();
  const coachDeepdive = mock<CoachDeepdiveService>();
  const teamDeepdive = mock<TeamDeepdiveService>();
  const playerDeepdive = mock<PlayerDeepdiveService>();
  const raceDeepdive = mock<RaceDeepdiveService>();
  const competitionDeepdive = mock<CompetitionDeepdiveService>();

  const moduleRef = await Test.createTestingModule({
    providers: [
      DeepdiveCommandService,
      { provide: ErasService, useValue: eras },
      { provide: CompetitionsService, useValue: competitions },
      { provide: CoachesService, useValue: coaches },
      { provide: TeamsService, useValue: teams },
      { provide: PlayersService, useValue: players },
      { provide: RacesService, useValue: races },
      { provide: DiscordClientService, useValue: discordClient },
      { provide: SlashCommandRegistryService, useValue: registry },
      { provide: EraDeepdiveService, useValue: eraDeepdive },
      { provide: CoachDeepdiveService, useValue: coachDeepdive },
      { provide: TeamDeepdiveService, useValue: teamDeepdive },
      { provide: PlayerDeepdiveService, useValue: playerDeepdive },
      { provide: RaceDeepdiveService, useValue: raceDeepdive },
      { provide: CompetitionDeepdiveService, useValue: competitionDeepdive },
    ],
  }).compile();

  return {
    service: moduleRef.get(DeepdiveCommandService),
    eras,
    competitions,
    coaches,
    teams,
    players,
    races,
    discordClient,
    registry,
    eraDeepdive,
    coachDeepdive,
    teamDeepdive,
    playerDeepdive,
    raceDeepdive,
    competitionDeepdive,
  };
}

function chatInput(options: {
  era?: string | null;
  coach?: string | null;
  team?: string | null;
  player?: string | null;
  race?: string | null;
  competition?: string | null;
}): ChatInputCommandInteraction {
  return {
    options: {
      getString: vi.fn((name: string) => {
        if (name === 'era') return options.era ?? null;
        if (name === 'coach') return options.coach ?? null;
        if (name === 'team') return options.team ?? null;
        if (name === 'player') return options.player ?? null;
        if (name === 'race') return options.race ?? null;
        return options.competition ?? null;
      }),
    },
  } as unknown as ChatInputCommandInteraction;
}

function autocompleteInteraction(
  value: string,
  name: 'era' | 'coach' | 'team' | 'player' | 'race' | 'competition' = 'era',
): AutocompleteInteraction {
  return {
    options: {
      getFocused: vi.fn((full?: boolean) =>
        full ? { name, value, type: 3, focused: true } : value,
      ),
    },
  } as unknown as AutocompleteInteraction;
}

function buttonInteraction(customId: string): ButtonInteraction {
  return { customId } as unknown as ButtonInteraction;
}

const SAMPLE_EMBED: InteractionReplyOptions = {
  embeds: [{ title: 'Sample', description: 'a rendered deepdive' }],
};

describe('DeepdiveCommandService', () => {
  it('builds a deepdive command with optional autocompleted era, coach, and team options', async () => {
    const { service } = await makeService();
    const command = service.buildCommand();
    expect(command.name).toBe('deepdive');
    expect(command.description).toEqual(expect.any(String));
    expect(command.options).toEqual([
      {
        name: 'era',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'coach',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'team',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'player',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'race',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'competition',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
    ]);
    expect(command.autocomplete).toEqual(expect.any(Function));
  });

  it('returns the usage message when no era target is given', async () => {
    const { service } = await makeService();
    const result = await service.execute(chatInput({}));
    expect(result).toBe(DEEPDIVE_USAGE_MESSAGE);
  });

  it('returns the not-found message for an era id that resolves to nothing', async () => {
    const { service, eraDeepdive } = await makeService();
    eraDeepdive.resolve.mockResolvedValue(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    const result = await service.execute(chatInput({ era: '999' }));
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    expect(eraDeepdive.resolve).toHaveBeenCalledWith(999);
  });

  it('forwards the rendered embed from the era deepdive service for a resolved era', async () => {
    const { service, eraDeepdive } = await makeService();
    eraDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ era: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(eraDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('returns era autocomplete choices labelled "<name> (<league>)" with id values', async () => {
    const { service, eras } = await makeService();
    eras.searchByNamePrefix.mockResolvedValue([
      { id: 20, name: 'BB2020', leagueName: 'Premier League' },
    ]);
    const choices = await service.autocomplete(autocompleteInteraction('bb'));
    expect(choices).toEqual([{ name: 'BB2020 (Premier League)', value: '20' }]);
  });

  it('registers itself with the registry and both button handlers on init', async () => {
    const { service, registry, discordClient } = await makeService();
    service.onModuleInit();
    expect(registry.register).toHaveBeenCalledTimes(1);
    const command = registry.register.mock.calls[0][0] as { name: string };
    expect(command.name).toBe('deepdive');
    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      ERA_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      COACH_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      TEAM_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      RACE_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
  });

  it('handles an era button by resolving the id from its customId', async () => {
    const { service, eraDeepdive } = await makeService();
    eraDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleEraButton(
      buttonInteraction(`${ERA_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(eraDeepdive.resolve).toHaveBeenCalledWith(7);
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when an era button id resolves to nothing', async () => {
    const { service, eraDeepdive } = await makeService();
    eraDeepdive.resolve.mockResolvedValue(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    const result = await service.handleEraButton(
      buttonInteraction(`${ERA_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for non-numeric era input without hitting the deepdive service', async () => {
    const { service, eraDeepdive } = await makeService();
    const result = await service.execute(chatInput({ era: 'abc' }));
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    expect(eraDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('returns the not-found message for a non-numeric era button id without hitting the deepdive service', async () => {
    const { service, eraDeepdive } = await makeService();
    const result = await service.handleEraButton(
      buttonInteraction(`${ERA_BUTTON_CUSTOM_ID_PREFIX}abc`),
    );
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    expect(eraDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('returns the not-found message for a coach id that resolves to nothing', async () => {
    const { service, coachDeepdive } = await makeService();
    coachDeepdive.resolve.mockResolvedValue(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
    const result = await service.execute(chatInput({ coach: '999' }));
    expect(result).toBe(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
    expect(coachDeepdive.resolve).toHaveBeenCalledWith(999);
  });

  it('forwards the rendered embed from the coach deepdive service for a resolved coach', async () => {
    const { service, coachDeepdive } = await makeService();
    coachDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ coach: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(coachDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('rejects the call when both era and coach are supplied', async () => {
    const { service, eraDeepdive, coachDeepdive } = await makeService();
    const result = await service.execute(chatInput({ era: '7', coach: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(eraDeepdive.resolve).not.toHaveBeenCalled();
    expect(coachDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('returns coach autocomplete choices labelled "<name> (#<id>)" with id values', async () => {
    const { service, coaches } = await makeService();
    coaches.searchByNamePrefix.mockResolvedValue([
      { id: 20, name: 'Roze Madder' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('ro', 'coach'),
    );
    expect(choices).toEqual([{ name: 'Roze Madder (#20)', value: '20' }]);
  });

  it('handles a coach button by resolving the id from its customId', async () => {
    const { service, coachDeepdive } = await makeService();
    coachDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleCoachButton(
      buttonInteraction(`${COACH_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(coachDeepdive.resolve).toHaveBeenCalledWith(7);
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when a coach button id resolves to nothing', async () => {
    const { service, coachDeepdive } = await makeService();
    coachDeepdive.resolve.mockResolvedValue(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
    const result = await service.handleCoachButton(
      buttonInteraction(`${COACH_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a team id that resolves to nothing', async () => {
    const { service, teamDeepdive } = await makeService();
    teamDeepdive.resolve.mockResolvedValue(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
    const result = await service.execute(chatInput({ team: '999' }));
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
    expect(teamDeepdive.resolve).toHaveBeenCalledWith(999);
  });

  it('forwards the rendered embed from the team deepdive service for a resolved team', async () => {
    const { service, teamDeepdive } = await makeService();
    teamDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ team: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(teamDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('rejects supplying both a team and another target', async () => {
    const { service, teamDeepdive } = await makeService();
    const result = await service.execute(chatInput({ era: '7', team: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(teamDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('returns team autocomplete choices labelled "<name> (#<id>)" with id values', async () => {
    const { service, teams } = await makeService();
    teams.searchByNamePrefix.mockResolvedValue([
      { id: 20, name: '40 grinders' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('40', 'team'),
    );
    expect(choices).toEqual([{ name: '40 grinders (#20)', value: '20' }]);
  });

  it('handles a team button by resolving the id from its customId', async () => {
    const { service, teamDeepdive } = await makeService();
    teamDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleTeamButton(
      buttonInteraction(`${TEAM_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(teamDeepdive.resolve).toHaveBeenCalledWith(7);
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when a team button id resolves to nothing', async () => {
    const { service, teamDeepdive } = await makeService();
    teamDeepdive.resolve.mockResolvedValue(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
    const result = await service.handleTeamButton(
      buttonInteraction(`${TEAM_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a player id that resolves to nothing', async () => {
    const { service, playerDeepdive } = await makeService();
    playerDeepdive.resolve.mockResolvedValue(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
    const result = await service.execute(chatInput({ player: '999' }));
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
    expect(playerDeepdive.resolve).toHaveBeenCalledWith(999);
  });

  it('forwards the rendered embed from the player deepdive service for a resolved player', async () => {
    const { service, playerDeepdive } = await makeService();
    playerDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ player: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(playerDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('rejects supplying both a player and another target', async () => {
    const { service, playerDeepdive } = await makeService();
    const result = await service.execute(chatInput({ era: '7', player: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(playerDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('returns player autocomplete choices labelled "<name> (<team>)" with id values', async () => {
    const { service, players } = await makeService();
    players.searchByNamePrefix.mockResolvedValue([
      { id: 20, name: 'Griff Oberwald', teamName: 'Reikland Reavers' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('gri', 'player'),
    );
    expect(choices).toEqual([
      { name: 'Griff Oberwald (Reikland Reavers)', value: '20' },
    ]);
  });

  it('handles a player button by resolving the id from its customId', async () => {
    const { service, playerDeepdive } = await makeService();
    playerDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handlePlayerButton(
      buttonInteraction(`${PLAYER_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(playerDeepdive.resolve).toHaveBeenCalledWith(7);
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when a player button id resolves to nothing', async () => {
    const { service, playerDeepdive } = await makeService();
    playerDeepdive.resolve.mockResolvedValue(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
    const result = await service.handlePlayerButton(
      buttonInteraction(`${PLAYER_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a non-numeric player id without hitting the deepdive service', async () => {
    const { service, playerDeepdive } = await makeService();
    const result = await service.execute(chatInput({ player: 'abc' }));
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
    expect(playerDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('returns the not-found message for a race id that resolves to nothing', async () => {
    const { service, raceDeepdive } = await makeService();
    raceDeepdive.resolve.mockResolvedValue(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
    const result = await service.execute(chatInput({ race: '999' }));
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
    expect(raceDeepdive.resolve).toHaveBeenCalledWith(999);
  });

  it('forwards the rendered embed from the race deepdive service for a resolved race', async () => {
    const { service, raceDeepdive } = await makeService();
    raceDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ race: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(raceDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('rejects supplying both a race and another target', async () => {
    const { service, raceDeepdive } = await makeService();
    const result = await service.execute(chatInput({ era: '7', race: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(raceDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('returns race autocomplete choices labelled by plain name with id values', async () => {
    const { service, races } = await makeService();
    races.searchByNamePrefix.mockResolvedValue([{ id: 20, name: 'Orc' }]);
    const choices = await service.autocomplete(
      autocompleteInteraction('or', 'race'),
    );
    expect(choices).toEqual([{ name: 'Orc', value: '20' }]);
  });

  it('handles a race button by resolving the id from its customId', async () => {
    const { service, raceDeepdive } = await makeService();
    raceDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleRaceButton(
      buttonInteraction(`${RACE_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(raceDeepdive.resolve).toHaveBeenCalledWith(7);
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when a race button id resolves to nothing', async () => {
    const { service, raceDeepdive } = await makeService();
    raceDeepdive.resolve.mockResolvedValue(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
    const result = await service.handleRaceButton(
      buttonInteraction(`${RACE_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a non-numeric race id without hitting the deepdive service', async () => {
    const { service, raceDeepdive } = await makeService();
    const result = await service.execute(chatInput({ race: 'abc' }));
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
    expect(raceDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('forwards the rendered embed from the competition deepdive service for a resolved competition', async () => {
    const { service, competitionDeepdive } = await makeService();
    competitionDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ competition: '3' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(competitionDeepdive.resolve).toHaveBeenCalledWith(3);
  });

  it('returns the not-found message for a competition id that resolves to nothing', async () => {
    const { service, competitionDeepdive } = await makeService();
    competitionDeepdive.resolve.mockResolvedValue(
      DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
    );
    const result = await service.execute(chatInput({ competition: '999' }));
    expect(result).toBe(DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE);
    expect(competitionDeepdive.resolve).toHaveBeenCalledWith(999);
  });

  it('rejects supplying both a competition and another target', async () => {
    const { service, competitionDeepdive } = await makeService();
    const result = await service.execute(
      chatInput({ era: '7', competition: '3' }),
    );
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(competitionDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('returns competition autocomplete choices labelled "<name> (<league>)"', async () => {
    const { service, competitions } = await makeService();
    competitions.searchByNamePrefix.mockResolvedValue([
      { id: 3, name: 'Major Season 24', leagueName: 'Premier' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('Maj', 'competition'),
    );
    expect(choices).toEqual([
      { name: 'Major Season 24 (Premier)', value: '3' },
    ]);
  });

  it('handles a competition button by resolving the id from its customId', async () => {
    const { service, competitionDeepdive } = await makeService();
    competitionDeepdive.resolve.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleCompetitionButton(
      buttonInteraction(`${COMPETITION_BUTTON_CUSTOM_ID_PREFIX}3`),
    );
    expect(competitionDeepdive.resolve).toHaveBeenCalledWith(3);
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message for a non-numeric competition id without hitting the deepdive service', async () => {
    const { service, competitionDeepdive } = await makeService();
    const result = await service.execute(chatInput({ competition: 'abc' }));
    expect(result).toBe(DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE);
    expect(competitionDeepdive.resolve).not.toHaveBeenCalled();
  });
});
