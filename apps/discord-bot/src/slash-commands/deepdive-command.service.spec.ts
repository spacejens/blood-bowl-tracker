import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  StringSelectMenuInteraction,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import { TrophyDeepdiveService } from '../deepdive/facts/trophy-deepdive.service';
import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_MULTIPLE_TARGETS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
  DEEPDIVE_USAGE_MESSAGE,
} from '../error-messages';
import { DeepdiveAutocompleteService } from './deepdive-autocomplete.service';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  DeepdiveCommandService,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from './deepdive-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

interface MadeService {
  service: DeepdiveCommandService;
  autocompleteService: MockProxy<DeepdiveAutocompleteService>;
  discordClient: MockProxy<DiscordClientService>;
  registry: MockProxy<SlashCommandRegistryService>;
  eraDeepdive: MockProxy<EraDeepdiveService>;
  coachDeepdive: MockProxy<CoachDeepdiveService>;
  teamDeepdive: MockProxy<TeamDeepdiveService>;
  playerDeepdive: MockProxy<PlayerDeepdiveService>;
  raceDeepdive: MockProxy<RaceDeepdiveService>;
  competitionDeepdive: MockProxy<CompetitionDeepdiveService>;
  trophyDeepdive: MockProxy<TrophyDeepdiveService>;
}

async function makeService(): Promise<MadeService> {
  const autocompleteService = mock<DeepdiveAutocompleteService>();
  const discordClient = mock<DiscordClientService>();
  const registry = mock<SlashCommandRegistryService>();
  const eraDeepdive = mock<EraDeepdiveService>();
  const coachDeepdive = mock<CoachDeepdiveService>();
  const teamDeepdive = mock<TeamDeepdiveService>();
  const playerDeepdive = mock<PlayerDeepdiveService>();
  const raceDeepdive = mock<RaceDeepdiveService>();
  const competitionDeepdive = mock<CompetitionDeepdiveService>();
  const trophyDeepdive = mock<TrophyDeepdiveService>();

  const moduleRef = await Test.createTestingModule({
    providers: [
      DeepdiveCommandService,
      { provide: DeepdiveAutocompleteService, useValue: autocompleteService },
      { provide: DiscordClientService, useValue: discordClient },
      { provide: SlashCommandRegistryService, useValue: registry },
      { provide: EraDeepdiveService, useValue: eraDeepdive },
      { provide: CoachDeepdiveService, useValue: coachDeepdive },
      { provide: TeamDeepdiveService, useValue: teamDeepdive },
      { provide: PlayerDeepdiveService, useValue: playerDeepdive },
      { provide: RaceDeepdiveService, useValue: raceDeepdive },
      { provide: CompetitionDeepdiveService, useValue: competitionDeepdive },
      { provide: TrophyDeepdiveService, useValue: trophyDeepdive },
    ],
  }).compile();

  return {
    service: moduleRef.get(DeepdiveCommandService),
    autocompleteService,
    discordClient,
    registry,
    eraDeepdive,
    coachDeepdive,
    teamDeepdive,
    playerDeepdive,
    raceDeepdive,
    competitionDeepdive,
    trophyDeepdive,
  };
}

function chatInput(options: {
  era?: string | null;
  coach?: string | null;
  team?: string | null;
  player?: string | null;
  race?: string | null;
  competition?: string | null;
  trophy?: string | null;
}): ChatInputCommandInteraction {
  return {
    options: {
      getString: vi.fn((name: string) => {
        if (name === 'era') return options.era ?? null;
        if (name === 'coach') return options.coach ?? null;
        if (name === 'team') return options.team ?? null;
        if (name === 'player') return options.player ?? null;
        if (name === 'race') return options.race ?? null;
        if (name === 'competition') return options.competition ?? null;
        return options.trophy ?? null;
      }),
    },
  } as unknown as ChatInputCommandInteraction;
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
      {
        name: 'trophy',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
    ]);
    expect(command.autocomplete).toEqual(expect.any(Function));
    expect(command.options?.[6]).toEqual({
      name: 'trophy',
      description: 'Show the detail view for a single trophy (optional)',
      type: ApplicationCommandOptionType.String,
      autocomplete: true,
    });
  });

  it('delegates the command autocomplete callback to DeepdiveAutocompleteService', async () => {
    const { service, autocompleteService } = await makeService();
    autocompleteService.resolve.mockResolvedValue([
      { name: 'BB2020 (Premier League)', value: '3' },
    ]);
    const command = service.buildCommand();
    const interaction = {} as unknown as AutocompleteInteraction;

    await expect(command.autocomplete?.(interaction)).resolves.toEqual([
      { name: 'BB2020 (Premier League)', value: '3' },
    ]);
    expect(autocompleteService.resolve).toHaveBeenCalledWith(interaction);
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
    expect(discordClient.registerSelectMenuHandler).toHaveBeenCalledWith(
      ERA_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerSelectMenuHandler).toHaveBeenCalledWith(
      COACH_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerSelectMenuHandler).toHaveBeenCalledWith(
      TEAM_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerSelectMenuHandler).toHaveBeenCalledWith(
      PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerSelectMenuHandler).toHaveBeenCalledWith(
      RACE_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerSelectMenuHandler).toHaveBeenCalledWith(
      COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
  });

  it('registers the trophy button and select-menu handlers', async () => {
    const { service, discordClient } = await makeService();

    service.onModuleInit();

    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      TROPHY_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerSelectMenuHandler).toHaveBeenCalledWith(
      TROPHY_BUTTON_CUSTOM_ID_PREFIX,
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

  it('resolves the trophy deepdive for a numeric trophy option', async () => {
    const { service, trophyDeepdive } = await makeService();
    trophyDeepdive.resolve.mockResolvedValue('trophy embed');

    await expect(service.execute(chatInput({ trophy: '7' }))).resolves.toBe(
      'trophy embed',
    );
    expect(trophyDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('rejects a non-numeric trophy option without hitting the database', async () => {
    const { service, trophyDeepdive } = await makeService();

    await expect(service.execute(chatInput({ trophy: 'nope' }))).resolves.toBe(
      DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
    );
    expect(trophyDeepdive.resolve).not.toHaveBeenCalled();
  });

  it('rejects a trophy option combined with another target', async () => {
    const { service } = await makeService();

    await expect(
      service.execute(chatInput({ trophy: '7', era: '3' })),
    ).resolves.toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
  });

  it('resolves the trophy deepdive from a trophy button', async () => {
    const { service, trophyDeepdive } = await makeService();
    trophyDeepdive.resolve.mockResolvedValue('trophy embed');
    const interaction = {
      customId: `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}7`,
    } as unknown as ButtonInteraction;

    await expect(service.handleTrophyButton(interaction)).resolves.toBe(
      'trophy embed',
    );
    expect(trophyDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('resolves the trophy deepdive from a trophy select menu', async () => {
    const { service, trophyDeepdive } = await makeService();
    trophyDeepdive.resolve.mockResolvedValue('trophy embed');
    const interaction = {
      values: ['7'],
    } as unknown as StringSelectMenuInteraction;

    await expect(service.handleTrophySelect(interaction)).resolves.toBe(
      'trophy embed',
    );
    expect(trophyDeepdive.resolve).toHaveBeenCalledWith(7);
  });

  it('returns the trophy not-found message for an empty trophy select menu', async () => {
    const { service } = await makeService();
    const interaction = {
      values: [],
    } as unknown as StringSelectMenuInteraction;

    await expect(service.handleTrophySelect(interaction)).resolves.toBe(
      DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
    );
  });
});

interface SelectCase {
  name: string;
  invoke: (
    service: DeepdiveCommandService,
    interaction: StringSelectMenuInteraction,
  ) => Promise<string | InteractionReplyOptions>;
  deepdive: (made: MadeService) => { resolve: ReturnType<typeof vi.fn> };
  notFoundMessage: string;
}

function selectInteraction(values: string[]): StringSelectMenuInteraction {
  return { values } as unknown as StringSelectMenuInteraction;
}

const selectCases: SelectCase[] = [
  {
    name: 'era',
    invoke: (service, interaction) => service.handleEraSelect(interaction),
    deepdive: (made) => made.eraDeepdive,
    notFoundMessage: DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  },
  {
    name: 'coach',
    invoke: (service, interaction) => service.handleCoachSelect(interaction),
    deepdive: (made) => made.coachDeepdive,
    notFoundMessage: DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  },
  {
    name: 'team',
    invoke: (service, interaction) => service.handleTeamSelect(interaction),
    deepdive: (made) => made.teamDeepdive,
    notFoundMessage: DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  },
  {
    name: 'player',
    invoke: (service, interaction) => service.handlePlayerSelect(interaction),
    deepdive: (made) => made.playerDeepdive,
    notFoundMessage: DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  },
  {
    name: 'race',
    invoke: (service, interaction) => service.handleRaceSelect(interaction),
    deepdive: (made) => made.raceDeepdive,
    notFoundMessage: DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  },
  {
    name: 'competition',
    invoke: (service, interaction) =>
      service.handleCompetitionSelect(interaction),
    deepdive: (made) => made.competitionDeepdive,
    notFoundMessage: DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  },
];

describe.each(selectCases)(
  'DeepdiveCommandService.handle$name Select',
  ({ invoke, deepdive, notFoundMessage }) => {
    it('resolves the deepdive for the selected value', async () => {
      const made = await makeService();
      const resolver = deepdive(made);
      resolver.resolve.mockResolvedValue('the deepdive');
      const result = await invoke(made.service, selectInteraction(['42']));
      expect(resolver.resolve).toHaveBeenCalledWith(42);
      expect(result).toBe('the deepdive');
    });

    it('returns the not-found message when nothing was selected', async () => {
      const made = await makeService();
      const resolver = deepdive(made);
      const result = await invoke(made.service, selectInteraction([]));
      expect(resolver.resolve).not.toHaveBeenCalled();
      expect(result).toBe(notFoundMessage);
    });

    it('returns the not-found message for a non-integer value', async () => {
      const made = await makeService();
      const resolver = deepdive(made);
      const result = await invoke(made.service, selectInteraction(['nope']));
      expect(resolver.resolve).not.toHaveBeenCalled();
      expect(result).toBe(notFoundMessage);
    });
  },
);
