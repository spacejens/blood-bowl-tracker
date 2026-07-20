import type { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  PlayersService,
  RacesService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_MULTIPLE_TARGETS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_USAGE_MESSAGE,
} from '../error-messages';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  DeepdiveCommandService,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
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
  const coaches = {
    findById: vi.fn().mockResolvedValue(undefined),
    getCareerSpan: vi.fn().mockResolvedValue(undefined),
    getTopTeamsByMatchesPlayed: vi.fn().mockResolvedValue([]),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
  } as unknown as CoachesService;
  const teams = {
    findById: vi.fn().mockResolvedValue(undefined),
    getCareerSpan: vi.fn().mockResolvedValue(undefined),
    getTopPlayersByMatchEventCount: vi.fn().mockResolvedValue([]),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
  } as unknown as TeamsService;
  const players = {
    findById: vi.fn().mockResolvedValue(undefined),
    getDeepdiveCategoryCounts: vi.fn().mockResolvedValue([]),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
  } as unknown as PlayersService;
  const races = {
    findById: vi.fn().mockResolvedValue(undefined),
    listEraNames: vi.fn().mockResolvedValue([]),
    getTopTeamsByMatchesPlayed: vi.fn().mockResolvedValue([]),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
  } as unknown as RacesService;
  const discordClient = {
    registerButtonHandler: vi.fn(),
  };
  const registry = {
    register: vi.fn(),
  };
  const service = new DeepdiveCommandService(
    eras,
    competitions,
    coaches,
    teams,
    players,
    races,
    discordClient as unknown as DiscordClientService,
    registry as unknown as SlashCommandRegistryService,
  );
  return {
    service,
    eras,
    competitions,
    coaches,
    teams,
    players,
    races,
    discordClient,
    registry,
  };
}

function chatInput(options: {
  era?: string | null;
  coach?: string | null;
  team?: string | null;
  player?: string | null;
  race?: string | null;
}): ChatInputCommandInteraction {
  return {
    options: {
      getString: vi.fn((name: string) => {
        if (name === 'era') return options.era ?? null;
        if (name === 'coach') return options.coach ?? null;
        if (name === 'team') return options.team ?? null;
        if (name === 'player') return options.player ?? null;
        return options.race ?? null;
      }),
    },
  } as unknown as ChatInputCommandInteraction;
}

function autocompleteInteraction(
  value: string,
  name: 'era' | 'coach' | 'team' | 'player' | 'race' = 'era',
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

describe('DeepdiveCommandService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a deepdive command with optional autocompleted era, coach, and team options', () => {
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
    ]);
    expect(command.autocomplete).toEqual(expect.any(Function));
  });

  it('returns the usage message when no era target is given', async () => {
    const { service } = makeService();
    const result = await service.execute(chatInput({}));
    expect(result).toBe(DEEPDIVE_USAGE_MESSAGE);
  });

  it('returns the not-found message for an era id that resolves to nothing', async () => {
    const { service, eras } = makeService();
    (eras.findByIdWithLeague as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    const result = await service.execute(chatInput({ era: '999' }));
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
    const result = await service.execute(chatInput({ era: '7' }));
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

  it('registers itself with the registry and both button handlers on init', () => {
    const { service, registry, discordClient } = makeService();
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
    const result = await service.execute(chatInput({ era: 'abc' }));
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

  it('returns the not-found message for a coach id that resolves to nothing', async () => {
    const { service, coaches } = makeService();
    const result = await service.execute(chatInput({ coach: '999' }));
    expect(result).toBe(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(coaches.findById).toHaveBeenCalledWith(999);
  });

  it('renders the coach deepdive embed for a resolved coach', async () => {
    const { service, coaches } = makeService();
    (coaches.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: 'Roze Madder',
    });
    (coaches.getCareerSpan as ReturnType<typeof vi.fn>).mockResolvedValue({
      start: '2021-09-01',
      end: '2023-06-10',
    });
    (
      coaches.getTopTeamsByMatchesPlayed as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ name: 'Reikland Reavers', count: 12 }]);
    const result = await service.execute(chatInput({ coach: '7' }));
    expect(result).toEqual({
      embeds: [
        {
          title: 'Roze Madder',
          description: [
            'Career: 2021-09-01 – 2023-06-10',
            '',
            'Top teams by matches played:',
            '1. Reikland Reavers — 12',
          ].join('\n'),
        },
      ],
    });
  });

  it('rejects the call when both era and coach are supplied', async () => {
    const { service, eras, coaches } = makeService();
    const result = await service.execute(chatInput({ era: '7', coach: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(eras.findByIdWithLeague).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(coaches.findById).not.toHaveBeenCalled();
  });

  it('returns coach autocomplete choices labelled "<name> (#<id>)" with id values', async () => {
    const { service, coaches } = makeService();
    (coaches.searchByNamePrefix as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 20, name: 'Roze Madder' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('ro', 'coach'),
    );
    expect(choices).toEqual([{ name: 'Roze Madder (#20)', value: '20' }]);
  });

  it('handles a coach button by resolving the id from its customId', async () => {
    const { service, coaches } = makeService();
    (coaches.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: 'Roze Madder',
    });
    (coaches.getCareerSpan as ReturnType<typeof vi.fn>).mockResolvedValue({
      start: '2021-09-01',
      end: '2023-06-10',
    });
    const result = await service.handleCoachButton(
      buttonInteraction(`${COACH_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(coaches.findById).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({ embeds: [{ title: 'Roze Madder' }] });
  });

  it('returns the not-found message when a coach button id resolves to nothing', async () => {
    const { service } = makeService();
    const result = await service.handleCoachButton(
      buttonInteraction(`${COACH_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a team id that resolves to nothing', async () => {
    const { service, teams } = makeService();
    const result = await service.execute(chatInput({ team: '999' }));
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.findById).toHaveBeenCalledWith(999);
  });

  it('renders the team deepdive embed for a resolved team', async () => {
    const { service, teams } = makeService();
    (teams.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: '40 grinders',
      raceName: 'Dwarf',
      coachName: 'Roze Madder',
    });
    (teams.getCareerSpan as ReturnType<typeof vi.fn>).mockResolvedValue({
      start: '2021-09-01',
      end: '2023-06-10',
    });
    (
      teams.getTopPlayersByMatchEventCount as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ name: 'Griff', count: 20 }]);
    const result = await service.execute(chatInput({ team: '7' }));
    expect(result).toEqual({
      embeds: [
        {
          title: '40 grinders',
          description: [
            'Race: Dwarf',
            'Coach: Roze Madder',
            'Career: 2021-09-01 – 2023-06-10',
            '',
            'Top players by match events:',
            '1. Griff — 20',
          ].join('\n'),
        },
      ],
    });
  });

  it('rejects supplying both a team and another target', async () => {
    const { service, teams } = makeService();
    const result = await service.execute(chatInput({ era: '7', team: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.findById).not.toHaveBeenCalled();
  });

  it('returns team autocomplete choices labelled "<name> (#<id>)" with id values', async () => {
    const { service, teams } = makeService();
    (teams.searchByNamePrefix as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 20, name: '40 grinders' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('40', 'team'),
    );
    expect(choices).toEqual([{ name: '40 grinders (#20)', value: '20' }]);
  });

  it('handles a team button by resolving the id from its customId', async () => {
    const { service, teams } = makeService();
    (teams.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: '40 grinders',
      raceName: 'Dwarf',
      coachName: 'Roze Madder',
    });
    (teams.getCareerSpan as ReturnType<typeof vi.fn>).mockResolvedValue({
      start: '2021-09-01',
      end: '2023-06-10',
    });
    const result = await service.handleTeamButton(
      buttonInteraction(`${TEAM_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.findById).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({ embeds: [{ title: '40 grinders' }] });
  });

  it('returns the not-found message when a team button id resolves to nothing', async () => {
    const { service } = makeService();
    const result = await service.handleTeamButton(
      buttonInteraction(`${TEAM_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a player id that resolves to nothing', async () => {
    const { service, players } = makeService();
    const result = await service.execute(chatInput({ player: '999' }));
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.findById).toHaveBeenCalledWith(999);
  });

  it('renders the player deepdive embed for a resolved player', async () => {
    const { service, players } = makeService();
    (players.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: 'Griff Oberwald',
      teamName: 'Reikland Reavers',
      raceName: 'Human',
      positionName: 'Blitzer',
    });
    (
      players.getDeepdiveCategoryCounts as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ label: 'MVP awards', count: 2 }]);
    const result = await service.execute(chatInput({ player: '7' }));
    expect(result).toEqual({
      embeds: [
        {
          title: 'Griff Oberwald',
          description: [
            'Team: Reikland Reavers',
            'Race: Human',
            'Position: Blitzer',
            '',
            'MVP awards: 2',
          ].join('\n'),
        },
      ],
    });
  });

  it('rejects supplying both a player and another target', async () => {
    const { service, players } = makeService();
    const result = await service.execute(chatInput({ era: '7', player: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.findById).not.toHaveBeenCalled();
  });

  it('returns player autocomplete choices labelled "<name> (<team>)" with id values', async () => {
    const { service, players } = makeService();
    (players.searchByNamePrefix as ReturnType<typeof vi.fn>).mockResolvedValue([
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
    const { service, players } = makeService();
    (players.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: 'Griff Oberwald',
      teamName: 'Reikland Reavers',
      raceName: 'Human',
      positionName: 'Blitzer',
    });
    const result = await service.handlePlayerButton(
      buttonInteraction(`${PLAYER_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.findById).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({ embeds: [{ title: 'Griff Oberwald' }] });
  });

  it('returns the not-found message when a player button id resolves to nothing', async () => {
    const { service } = makeService();
    const result = await service.handlePlayerButton(
      buttonInteraction(`${PLAYER_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a non-numeric player id without hitting the database', async () => {
    const { service, players } = makeService();
    const result = await service.execute(chatInput({ player: 'abc' }));
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.findById).not.toHaveBeenCalled();
  });

  it('returns the not-found message for a race id that resolves to nothing', async () => {
    const { service, races } = makeService();
    const result = await service.execute(chatInput({ race: '999' }));
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(races.findById).toHaveBeenCalledWith(999);
  });

  it('renders the race deepdive embed for a resolved race', async () => {
    const { service, races } = makeService();
    (races.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: 'Orc',
    });
    (races.listEraNames as ReturnType<typeof vi.fn>).mockResolvedValue([
      'BB2020',
    ]);
    (
      races.getTopTeamsByMatchesPlayed as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ name: 'Gouged Eye', count: 40 }]);
    const result = await service.execute(chatInput({ race: '7' }));
    expect(result).toEqual({
      embeds: [
        {
          title: 'Orc',
          description: [
            'Eras: BB2020',
            '',
            'Top teams by matches played:',
            '1. Gouged Eye — 40',
          ].join('\n'),
        },
      ],
    });
  });

  it('rejects supplying both a race and another target', async () => {
    const { service, races } = makeService();
    const result = await service.execute(chatInput({ era: '7', race: '3' }));
    expect(result).toBe(DEEPDIVE_MULTIPLE_TARGETS_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(races.findById).not.toHaveBeenCalled();
  });

  it('returns race autocomplete choices labelled by plain name with id values', async () => {
    const { service, races } = makeService();
    (races.searchByNamePrefix as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 20, name: 'Orc' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('or', 'race'),
    );
    expect(choices).toEqual([{ name: 'Orc', value: '20' }]);
  });

  it('handles a race button by resolving the id from its customId', async () => {
    const { service, races } = makeService();
    (races.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: 'Orc',
    });
    const result = await service.handleRaceButton(
      buttonInteraction(`${RACE_BUTTON_CUSTOM_ID_PREFIX}7`),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(races.findById).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({ embeds: [{ title: 'Orc' }] });
  });

  it('returns the not-found message when a race button id resolves to nothing', async () => {
    const { service } = makeService();
    const result = await service.handleRaceButton(
      buttonInteraction(`${RACE_BUTTON_CUSTOM_ID_PREFIX}999`),
    );
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
  });

  it('returns the not-found message for a non-numeric race id without hitting the database', async () => {
    const { service, races } = makeService();
    const result = await service.execute(chatInput({ race: 'abc' }));
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(races.findById).not.toHaveBeenCalled();
  });
});
