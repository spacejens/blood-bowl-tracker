import type { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InsightsCommandService } from './insights-command.service';

function makeService() {
  const zero = () => ({ countAll: vi.fn().mockResolvedValue(0) });
  const coaches = {
    countMatchesPlayedByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 9 }]),
    countTeamsByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]),
    countAll: vi.fn().mockResolvedValue(0),
  } as unknown as CoachesService;
  const teams = {
    countMatchesPlayedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 12 }]),
    countAll: vi.fn().mockResolvedValue(0),
  } as unknown as TeamsService;
  const matches = {
    countAll: vi.fn().mockResolvedValue(0),
    countMatchEvents: vi.fn().mockResolvedValue(0),
  } as unknown as MatchesService;
  const competitions = {
    countAll: vi.fn().mockResolvedValue(0),
    countByType: vi.fn().mockResolvedValue(0),
  } as unknown as CompetitionsService;
  const leagues = zero() as unknown as LeaguesService;
  const rulesSets = zero() as unknown as RulesSetsService;
  const eras = {
    findById: vi.fn().mockResolvedValue(undefined),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
    countAll: vi.fn().mockResolvedValue(0),
  } as unknown as ErasService;
  const players = zero() as unknown as PlayersService;
  const positions = zero() as unknown as PositionsService;
  const races = zero() as unknown as RacesService;
  const externalSystems = zero() as unknown as ExternalSystemsService;
  const discordClient = {
    registerCommands: vi.fn().mockResolvedValue(undefined),
  };
  return {
    service: new InsightsCommandService(
      coaches,
      teams,
      matches,
      competitions,
      leagues,
      rulesSets,
      eras,
      players,
      positions,
      races,
      externalSystems,
      discordClient as unknown as DiscordClientService,
    ),
    coaches,
    teams,
    eras,
    discordClient,
  };
}

function chatInput(
  category: string | null,
  era: string | null = null,
): ChatInputCommandInteraction {
  return {
    options: {
      getString: vi.fn((name: string) => (name === 'era' ? era : category)),
    },
  } as unknown as ChatInputCommandInteraction;
}

function autocompleteInteraction(
  name: string,
  value: string,
): AutocompleteInteraction {
  return {
    options: {
      getFocused: vi.fn((full?: boolean) =>
        full ? { name, value, type: 3, focused: true } : value,
      ),
    },
  } as unknown as AutocompleteInteraction;
}

describe('InsightsCommandService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds an insights command definition with an autocompleted category option', () => {
    const { service } = makeService();
    const command = service.buildCommand();
    expect(command.name).toBe('insights');
    expect(command.description).toEqual(expect.any(String));
    expect(command.options?.[0]).toEqual({
      name: 'category',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real string
      description: expect.any(String),
      type: 3,
      autocomplete: true,
    });
    expect(command.autocomplete).toEqual(expect.any(Function));
  });

  it('resolves an exact leaf path to that fact', async () => {
    const { service, coaches } = makeService();
    const result = await service.execute(
      chatInput('coach.toplist.matches.played'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played',
          description: '1. Roze Madder — 9',
        },
      ],
    });
  });

  it('picks a random leaf under a branch path', async () => {
    const { service, coaches } = makeService();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput('coach'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });

  it('picks a random leaf across the whole tree when no category is given', async () => {
    const { service, coaches } = makeService();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput(null));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });

  it('resolveRandomFact picks a random leaf across the whole tree', async () => {
    const { service, coaches } = makeService();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.resolveRandomFact();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });

  it('returns the apothecary fallback for an unknown path', async () => {
    const { service } = makeService();
    const result = await service.execute(chatInput('coach.nope'));
    expect(result).toBe("Even the Apothecary can't make sense of that one.");
  });

  it('returns category autocomplete choices for the focused partial path', async () => {
    const { service } = makeService();
    const choices = await service.autocomplete(
      autocompleteInteraction('category', 'coach.'),
    );
    expect(choices).toEqual([
      { name: 'coach.toplist', value: 'coach.toplist' },
    ]);
  });

  it('registers only the insights command on bootstrap', async () => {
    const { service, discordClient } = makeService();
    await service.onApplicationBootstrap();
    expect(discordClient.registerCommands).toHaveBeenCalledTimes(1);
    const commands = discordClient.registerCommands.mock.calls[0][0] as {
      name: string;
    }[];
    expect(commands.map((c) => c.name)).toEqual(['insights']);
  });

  it('advertises an era option alongside category', () => {
    const { service } = makeService();
    const command = service.buildCommand();
    expect(command.options).toEqual([
      {
        name: 'category',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
      {
        name: 'era',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
        description: expect.any(String),
        type: 3,
        autocomplete: true,
      },
    ]);
  });

  it('scopes an era-supporting category to the resolved era and names it in the title', async () => {
    const { service, coaches, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played — BB2020',
          description: '1. Roze Madder — 9',
        },
      ],
    });
  });

  it('rejects an era on a non-era-supporting category (stats)', async () => {
    const { service, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(chatInput('stats', '20'));
    expect(result).toBe(
      'Even the Assistant Coach cannot understand your request',
    );
  });

  it('restricts the random pick to era-supporting leaves when an era but no category is given', async () => {
    const { service, coaches, teams, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    // Force pickRandom to the last eligible leaf; stats must have been excluded.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const result = await service.execute(chatInput(null, '20'));
    // No matter which era-supporting leaf is chosen, the reply is era-scoped,
    // never the stats summary (which has no title suffix and opts out).
    expect(result).not.toBe(
      'Even the Assistant Coach cannot understand your request',
    );
    const calledWithEra =
      (coaches.countMatchesPlayedByCoach as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (coaches.countTeamsByCoach as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countMatchesPlayedByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0;
    expect(calledWithEra).toBe(true);
  });

  it('rejects an era id that does not resolve to a real era', async () => {
    const { service, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', '999'),
    );
    expect(result).toBe(
      'Even the Assistant Coach cannot understand your request',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(eras.findById).toHaveBeenCalledWith(999);
  });

  it('returns era autocomplete choices labelled "<name> (<league>)" with id values', async () => {
    const { service, eras } = makeService();
    (eras.searchByNamePrefix as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 20, name: 'BB2020', leagueName: 'Premier League' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('era', 'bb'),
    );
    expect(choices).toEqual([{ name: 'BB2020 (Premier League)', value: '20' }]);
  });
});
