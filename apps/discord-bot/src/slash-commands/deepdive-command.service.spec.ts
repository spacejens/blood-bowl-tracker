import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_MULTIPLE_TARGETS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
  DEEPDIVE_USAGE_MESSAGE,
} from '../error-messages';
import { DeepdiveAutocompleteService } from './deepdive-autocomplete.service';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  DeepdiveCommandService,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from './deepdive-command.service';
import { DeepdiveTargetResolverService } from './deepdive-target-resolver.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

interface MadeService {
  service: DeepdiveCommandService;
  autocompleteService: MockProxy<DeepdiveAutocompleteService>;
  discordClient: MockProxy<DiscordClientService>;
  registry: MockProxy<SlashCommandRegistryService>;
  targetResolver: MockProxy<DeepdiveTargetResolverService>;
}

async function makeService(): Promise<MadeService> {
  const autocompleteService = mock<DeepdiveAutocompleteService>();
  const discordClient = mock<DiscordClientService>();
  const registry = mock<SlashCommandRegistryService>();
  const targetResolver = mock<DeepdiveTargetResolverService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      DeepdiveCommandService,
      { provide: DeepdiveAutocompleteService, useValue: autocompleteService },
      { provide: DiscordClientService, useValue: discordClient },
      { provide: SlashCommandRegistryService, useValue: registry },
      { provide: DeepdiveTargetResolverService, useValue: targetResolver },
    ],
  }).compile();

  return {
    service: moduleRef.get(DeepdiveCommandService),
    autocompleteService,
    discordClient,
    registry,
    targetResolver,
  };
}

function chatInput(options: {
  era?: string | null;
  coach?: string | null;
  team?: string | null;
  player?: string | null;
  starPlayer?: string | null;
  race?: string | null;
  competition?: string | null;
  trophy?: string | null;
  competitionGroup?: string | null;
}): ChatInputCommandInteraction {
  return {
    options: {
      getString: vi.fn((name: string) => {
        if (name === 'era') return options.era ?? null;
        if (name === 'coach') return options.coach ?? null;
        if (name === 'team') return options.team ?? null;
        if (name === 'player') return options.player ?? null;
        if (name === 'star-player') return options.starPlayer ?? null;
        if (name === 'race') return options.race ?? null;
        if (name === 'competition') return options.competition ?? null;
        if (name === 'trophy') return options.trophy ?? null;
        return options.competitionGroup ?? null;
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
        description: 'Show the detail view for a single era (optional)',
        type: 3,
        autocomplete: true,
      },
      {
        name: 'coach',
        description: 'Show the detail view for a single coach (optional)',
        type: 3,
        autocomplete: true,
      },
      {
        name: 'team',
        description: 'Show the detail view for a single team (optional)',
        type: 3,
        autocomplete: true,
      },
      {
        name: 'player',
        description: 'Show the detail view for a single player (optional)',
        type: 3,
        autocomplete: true,
      },
      {
        name: 'star-player',
        description: 'Show the detail view for a single star player (optional)',
        type: 3,
        autocomplete: true,
      },
      {
        name: 'race',
        description: 'Show the detail view for a single race (optional)',
        type: 3,
        autocomplete: true,
      },
      {
        name: 'competition',
        description: 'Show the detail view for a single competition (optional)',
        type: 3,
        autocomplete: true,
      },
      {
        name: 'trophy',
        description: 'Show the detail view for a single trophy (optional)',
        type: 3,
        autocomplete: true,
      },
      {
        name: 'competition-group',
        description:
          'Show the detail view for a single competition group (optional)',
        type: 3,
        autocomplete: true,
      },
    ]);
    expect(command.autocomplete).toEqual(expect.any(Function));
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
    const { service, targetResolver } = await makeService();
    targetResolver.resolveEra.mockResolvedValue(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    const result = await service.execute(chatInput({ era: '999' }));
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    expect(targetResolver.resolveEra).toHaveBeenCalledWith('999');
  });

  it('forwards the rendered embed from the era deepdive service for a resolved era', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveEra.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ era: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(targetResolver.resolveEra).toHaveBeenCalledWith('7');
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
      STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
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
      STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
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
    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      TROPHY_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerSelectMenuHandler).toHaveBeenCalledWith(
      TROPHY_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
    expect(discordClient.registerSelectMenuHandler).toHaveBeenCalledWith(
      COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
  });

  it('handles an era button by resolving the id from its customId', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveEra.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleEraButton(
      buttonInteraction(`${ERA_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(targetResolver.resolveEra).toHaveBeenCalledWith('7');
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when an era button id resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveEra.mockResolvedValue(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    const result = await service.handleEraButton(
      buttonInteraction(`${ERA_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a coach id that resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveCoach.mockResolvedValue(
      DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
    );
    const result = await service.execute(chatInput({ coach: '999' }));
    expect(result).toBe(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
    expect(targetResolver.resolveCoach).toHaveBeenCalledWith('999');
  });

  it('forwards the rendered embed from the coach deepdive service for a resolved coach', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveCoach.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ coach: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(targetResolver.resolveCoach).toHaveBeenCalledWith('7');
  });

  it('rejects the call when both era and coach are supplied', async () => {
    const { service, targetResolver } = await makeService();
    const result = await service.execute(chatInput({ era: '7', coach: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(targetResolver.resolveEra).not.toHaveBeenCalled();
    expect(targetResolver.resolveCoach).not.toHaveBeenCalled();
  });

  it('handles a coach button by resolving the id from its customId', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveCoach.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleCoachButton(
      buttonInteraction(`${COACH_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(targetResolver.resolveCoach).toHaveBeenCalledWith('7');
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when a coach button id resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveCoach.mockResolvedValue(
      DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
    );
    const result = await service.handleCoachButton(
      buttonInteraction(`${COACH_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a team id that resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveTeam.mockResolvedValue(
      DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
    );
    const result = await service.execute(chatInput({ team: '999' }));
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
    expect(targetResolver.resolveTeam).toHaveBeenCalledWith('999');
  });

  it('forwards the rendered embed from the team deepdive service for a resolved team', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveTeam.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ team: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(targetResolver.resolveTeam).toHaveBeenCalledWith('7');
  });

  it('rejects supplying both a team and another target', async () => {
    const { service, targetResolver } = await makeService();
    const result = await service.execute(chatInput({ era: '7', team: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(targetResolver.resolveTeam).not.toHaveBeenCalled();
  });

  it('handles a team button by resolving the id from its customId', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveTeam.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleTeamButton(
      buttonInteraction(`${TEAM_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(targetResolver.resolveTeam).toHaveBeenCalledWith('7');
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when a team button id resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveTeam.mockResolvedValue(
      DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
    );
    const result = await service.handleTeamButton(
      buttonInteraction(`${TEAM_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a player id that resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolvePlayer.mockResolvedValue(
      DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
    );
    const result = await service.execute(chatInput({ player: '999' }));
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
    expect(targetResolver.resolvePlayer).toHaveBeenCalledWith('999');
  });

  it('forwards the rendered embed from the player deepdive service for a resolved player', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolvePlayer.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ player: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(targetResolver.resolvePlayer).toHaveBeenCalledWith('7');
  });

  it('rejects supplying both a player and another target', async () => {
    const { service, targetResolver } = await makeService();
    const result = await service.execute(chatInput({ era: '7', player: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(targetResolver.resolvePlayer).not.toHaveBeenCalled();
  });

  it('handles a player button by resolving the id from its customId', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolvePlayer.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handlePlayerButton(
      buttonInteraction(`${PLAYER_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(targetResolver.resolvePlayer).toHaveBeenCalledWith('7');
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when a player button id resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolvePlayer.mockResolvedValue(
      DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
    );
    const result = await service.handlePlayerButton(
      buttonInteraction(`${PLAYER_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
  });

  it('forwards the rendered embed from the star player deepdive for a resolved id', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveStarPlayer.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ starPlayer: '20' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(targetResolver.resolveStarPlayer).toHaveBeenCalledWith('20');
  });

  it('rejects supplying both a star player and another target', async () => {
    const { service } = await makeService();
    const result = await service.execute(
      chatInput({ starPlayer: '20', team: '1' }),
    );
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
  });

  it('handles a star player button by resolving the id from its customId', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveStarPlayer.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleStarPlayerButton(
      buttonInteraction(`${STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX}20`),
    );
    expect(result).toBe(SAMPLE_EMBED);
    expect(targetResolver.resolveStarPlayer).toHaveBeenCalledWith('20');
  });

  it('handles a star player select by resolving the chosen value', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveStarPlayer.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleStarPlayerSelect(
      selectInteraction(['20']),
    );
    expect(result).toBe(SAMPLE_EMBED);
    expect(targetResolver.resolveStarPlayer).toHaveBeenCalledWith('20');
  });

  it('returns the star player not-found message for an empty select', async () => {
    const { service } = await makeService();
    const result = await service.handleStarPlayerSelect(selectInteraction([]));
    expect(result).toBe(DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a race id that resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveRace.mockResolvedValue(
      DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
    );
    const result = await service.execute(chatInput({ race: '999' }));
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
    expect(targetResolver.resolveRace).toHaveBeenCalledWith('999');
  });

  it('forwards the rendered embed from the race deepdive service for a resolved race', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveRace.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ race: '7' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(targetResolver.resolveRace).toHaveBeenCalledWith('7');
  });

  it('rejects supplying both a race and another target', async () => {
    const { service, targetResolver } = await makeService();
    const result = await service.execute(chatInput({ era: '7', race: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(targetResolver.resolveRace).not.toHaveBeenCalled();
  });

  it('handles a race button by resolving the id from its customId', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveRace.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleRaceButton(
      buttonInteraction(`${RACE_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    expect(targetResolver.resolveRace).toHaveBeenCalledWith('7');
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('returns the not-found message when a race button id resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveRace.mockResolvedValue(
      DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
    );
    const result = await service.handleRaceButton(
      buttonInteraction(`${RACE_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
  });

  it('forwards the rendered embed from the competition deepdive service for a resolved competition', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveCompetition.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.execute(chatInput({ competition: '3' }));
    expect(result).toBe(SAMPLE_EMBED);
    expect(targetResolver.resolveCompetition).toHaveBeenCalledWith('3');
  });

  it('returns the not-found message for a competition id that resolves to nothing', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveCompetition.mockResolvedValue(
      DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
    );
    const result = await service.execute(chatInput({ competition: '999' }));
    expect(result).toBe(DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE);
    expect(targetResolver.resolveCompetition).toHaveBeenCalledWith('999');
  });

  it('rejects supplying both a competition and another target', async () => {
    const { service, targetResolver } = await makeService();
    const result = await service.execute(
      chatInput({ era: '7', competition: '3' }),
    );
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    expect(targetResolver.resolveCompetition).not.toHaveBeenCalled();
  });

  it('handles a competition button by resolving the id from its customId', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveCompetition.mockResolvedValue(SAMPLE_EMBED);
    const result = await service.handleCompetitionButton(
      buttonInteraction(`${COMPETITION_BUTTON_CUSTOM_ID_PREFIX}3`),
    );
    expect(targetResolver.resolveCompetition).toHaveBeenCalledWith('3');
    expect(result).toBe(SAMPLE_EMBED);
  });

  it('resolves the trophy deepdive for a numeric trophy option', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveTrophy.mockResolvedValue('trophy embed');

    await expect(service.execute(chatInput({ trophy: '7' }))).resolves.toBe(
      'trophy embed',
    );
    expect(targetResolver.resolveTrophy).toHaveBeenCalledWith('7');
  });

  it('rejects a trophy option combined with another target', async () => {
    const { service } = await makeService();

    await expect(
      service.execute(chatInput({ trophy: '7', era: '3' })),
    ).resolves.toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
  });

  it('resolves the trophy deepdive from a trophy button', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveTrophy.mockResolvedValue('trophy embed');
    const interaction = {
      customId: `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}7`,
    } as unknown as ButtonInteraction;

    await expect(service.handleTrophyButton(interaction)).resolves.toBe(
      'trophy embed',
    );
    expect(targetResolver.resolveTrophy).toHaveBeenCalledWith('7');
  });

  it('resolves the competition group deepdive for a numeric option', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveCompetitionGroup.mockResolvedValue('group embed');

    await expect(
      service.execute(chatInput({ competitionGroup: '4' })),
    ).resolves.toBe('group embed');
    expect(targetResolver.resolveCompetitionGroup).toHaveBeenCalledWith('4');
  });

  it('rejects a competition group option combined with another target', async () => {
    const { service } = await makeService();

    await expect(
      service.execute(chatInput({ competitionGroup: '4', era: '3' })),
    ).resolves.toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
  });

  it('resolves the competition group deepdive from a competition group button', async () => {
    const { service, targetResolver } = await makeService();
    targetResolver.resolveCompetitionGroup.mockResolvedValue('group embed');
    const interaction = {
      customId: `${COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX}4`,
    } as unknown as ButtonInteraction;

    await expect(
      service.handleCompetitionGroupButton(interaction),
    ).resolves.toBe('group embed');
    expect(targetResolver.resolveCompetitionGroup).toHaveBeenCalledWith('4');
  });
});

interface SelectCase {
  name: string;
  invoke: (
    service: DeepdiveCommandService,
    interaction: StringSelectMenuInteraction,
  ) => Promise<string | InteractionReplyOptions>;
  resolver: (
    made: MadeService,
  ) => Mock<[string], Promise<string | InteractionReplyOptions>>;
  notFoundMessage: string;
}

function selectInteraction(values: string[]): StringSelectMenuInteraction {
  return { values } as unknown as StringSelectMenuInteraction;
}

const selectCases: SelectCase[] = [
  {
    name: 'era',
    invoke: (service, interaction) => service.handleEraSelect(interaction),
    resolver: (made) => made.targetResolver.resolveEra,
    notFoundMessage: DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  },
  {
    name: 'coach',
    invoke: (service, interaction) => service.handleCoachSelect(interaction),
    resolver: (made) => made.targetResolver.resolveCoach,
    notFoundMessage: DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  },
  {
    name: 'team',
    invoke: (service, interaction) => service.handleTeamSelect(interaction),
    resolver: (made) => made.targetResolver.resolveTeam,
    notFoundMessage: DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  },
  {
    name: 'player',
    invoke: (service, interaction) => service.handlePlayerSelect(interaction),
    resolver: (made) => made.targetResolver.resolvePlayer,
    notFoundMessage: DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  },
  {
    name: 'race',
    invoke: (service, interaction) => service.handleRaceSelect(interaction),
    resolver: (made) => made.targetResolver.resolveRace,
    notFoundMessage: DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  },
  {
    name: 'competition',
    invoke: (service, interaction) =>
      service.handleCompetitionSelect(interaction),
    resolver: (made) => made.targetResolver.resolveCompetition,
    notFoundMessage: DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  },
  {
    name: 'trophy',
    invoke: (service, interaction) => service.handleTrophySelect(interaction),
    resolver: (made) => made.targetResolver.resolveTrophy,
    notFoundMessage: DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
  },
  {
    name: 'competitionGroup',
    invoke: (service, interaction) =>
      service.handleCompetitionGroupSelect(interaction),
    resolver: (made) => made.targetResolver.resolveCompetitionGroup,
    notFoundMessage: DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
  },
];

describe.each(selectCases)(
  'DeepdiveCommandService.handle$name Select',
  ({ invoke, resolver, notFoundMessage }) => {
    it('resolves the deepdive for the selected value', async () => {
      const made = await makeService();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const resolverMethod = resolver(made); // eslint-disable-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      resolverMethod.mockResolvedValue('the deepdive');
      const result = await invoke(made.service, selectInteraction(['42']));
      expect(resolverMethod).toHaveBeenCalledWith('42');
      expect(result).toBe('the deepdive');
    });

    it('returns the not-found message when nothing was selected', async () => {
      const made = await makeService();
      const result = await invoke(made.service, selectInteraction([]));
      expect(result).toBe(notFoundMessage);
    });

    it('returns the not-found message for a non-integer value', async () => {
      const made = await makeService();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const resolverMethod = resolver(made); // eslint-disable-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      resolverMethod.mockResolvedValue(notFoundMessage);
      const result = await invoke(made.service, selectInteraction(['nope']));
      expect(resolverMethod).toHaveBeenCalledWith('nope');
      expect(result).toBe(notFoundMessage);
    });
  },
);
