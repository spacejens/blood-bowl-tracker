import type { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import type {
  CompetitionsService,
  ErasService,
} from '@blood-bowl-tracker/game-data';
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_USAGE_MESSAGE,
} from '../error-messages';
import {
  DeepdiveCommandService,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
} from './deepdive-command.service';
import type { SlashCommandRegistryService } from './slash-command-registry.service';

function makeService() {
  const eras = {
    findByIdWithLeague: vi.fn().mockResolvedValue(undefined),
    getRulesSetNames: vi.fn().mockResolvedValue([]),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
  } as unknown as ErasService;
  const competitions = {
    listByEraChronological: vi.fn().mockResolvedValue([]),
  } as unknown as CompetitionsService;
  const discordClient = {
    registerButtonHandler: vi.fn(),
  };
  const registry = {
    register: vi.fn(),
  };
  const service = new DeepdiveCommandService(
    eras,
    competitions,
    discordClient as unknown as DiscordClientService,
    registry as unknown as SlashCommandRegistryService,
  );
  return { service, eras, competitions, discordClient, registry };
}

function chatInput(era: string | null): ChatInputCommandInteraction {
  return {
    options: { getString: vi.fn(() => era) },
  } as unknown as ChatInputCommandInteraction;
}

function autocompleteInteraction(value: string): AutocompleteInteraction {
  return {
    options: {
      getFocused: vi.fn((full?: boolean) =>
        full ? { name: 'era', value, type: 3, focused: true } : value,
      ),
    },
  } as unknown as AutocompleteInteraction;
}

function buttonInteraction(customId: string): ButtonInteraction {
  return { customId } as unknown as ButtonInteraction;
}

describe('DeepdiveCommandService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a deepdive command with one optional autocompleted era option', () => {
    const { service } = makeService();
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
    ]);
    expect(command.autocomplete).toEqual(expect.any(Function));
  });

  it('returns the usage message when no era target is given', async () => {
    const { service } = makeService();
    const result = await service.execute(chatInput(null));
    expect(result).toBe(DEEPDIVE_USAGE_MESSAGE);
  });

  it('returns the not-found message for an era id that resolves to nothing', async () => {
    const { service, eras } = makeService();
    (eras.findByIdWithLeague as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    const result = await service.execute(chatInput('999'));
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(eras.findByIdWithLeague).toHaveBeenCalledWith(999);
  });

  it('renders the era deepdive embed for a resolved era', async () => {
    const { service, eras, competitions } = makeService();
    (eras.findByIdWithLeague as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: 'BB2020',
      leagueName: 'Premier',
      startDate: '2021-09-01',
      endDate: null,
    });
    (eras.getRulesSetNames as ReturnType<typeof vi.fn>).mockResolvedValue([
      'BB2020',
    ]);
    (
      competitions.listByEraChronological as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ id: 10, name: 'Season 1', type: 'season' }]);
    const result = await service.execute(chatInput('7'));
    expect(result).toEqual({
      embeds: [
        {
          title: 'BB2020',
          description: [
            'League: Premier',
            'Dates: 2021-09-01 – present',
            'Rules: BB2020',
            '',
            'Season 1 (season)',
          ].join('\n'),
        },
      ],
    });
  });

  it('returns era autocomplete choices labelled "<name> (<league>)" with id values', async () => {
    const { service, eras } = makeService();
    (eras.searchByNamePrefix as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 20, name: 'BB2020', leagueName: 'Premier League' },
    ]);
    const choices = await service.autocomplete(autocompleteInteraction('bb'));
    expect(choices).toEqual([{ name: 'BB2020 (Premier League)', value: '20' }]);
  });

  it('registers itself with the registry and the era button handler on init', () => {
    const { service, registry, discordClient } = makeService();
    service.onModuleInit();
    expect(registry.register).toHaveBeenCalledTimes(1);
    const command = registry.register.mock.calls[0][0] as { name: string };
    expect(command.name).toBe('deepdive');
    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      ERA_BUTTON_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
  });

  it('handles an era button by resolving the id from its customId', async () => {
    const { service, eras } = makeService();
    (eras.findByIdWithLeague as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: 'BB2020',
      leagueName: 'Premier',
      startDate: '2021-09-01',
      endDate: null,
    });
    const result = await service.handleEraButton(
      buttonInteraction(`${ERA_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(eras.findByIdWithLeague).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({ embeds: [{ title: 'BB2020' }] });
  });

  it('returns the not-found message when an era button id resolves to nothing', async () => {
    const { service } = makeService();
    const result = await service.handleEraButton(
      buttonInteraction(`${ERA_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for non-numeric era input without hitting the database', async () => {
    const { service, eras } = makeService();
    const result = await service.execute(chatInput('abc'));
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(eras.findByIdWithLeague).not.toHaveBeenCalled();
  });

  it('returns the not-found message for a non-numeric era button id without hitting the database', async () => {
    const { service, eras } = makeService();
    const result = await service.handleEraButton(
      buttonInteraction(`${ERA_BUTTON_CUSTOM_ID_PREFIX}abc`),
    );
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(eras.findByIdWithLeague).not.toHaveBeenCalled();
  });
});
