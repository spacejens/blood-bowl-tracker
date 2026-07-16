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

import { DATABASE_TIMEOUT_FALLBACK_MESSAGE } from '../database-timeout';
import { InsightsCommandService } from './insights-command.service';

function makeService() {
  const zero = () => ({
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  });
  const coaches = {
    countMatchesPlayedByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 9 }]),
    countTeamsByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]),
    countCompetitionsByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 5 }]),
    countErasByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]),
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as CoachesService;
  const teams = {
    countMatchesPlayedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 12 }]),
    countCompetitionsByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    countErasByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 3 }]),
    countTouchdownsScoredByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 15 }]),
    countCompletionsByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 8 }]),
    countInterceptionsByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 5 }]),
    countDeflectionsByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    countCasualtiesCausedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 22 }]),
    countSeriousInjuriesCausedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 7 }]),
    countDeathsCausedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    countCasualtiesSufferedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 18 }]),
    countSeriousInjuriesSufferedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 6 }]),
    countLastingInjuriesSufferedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    countDeathsSufferedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]),
    countFoulsCommittedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 13 }]),
    countTimesSentOffByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 8 }]),
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as TeamsService;
  const matches = {
    countAll: vi.fn().mockResolvedValue(0),
    countMatchEvents: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countMatchEventsByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
    countMatchEventsByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as MatchesService;
  const competitions = {
    countAll: vi.fn().mockResolvedValue(0),
    countByType: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    findById: vi.fn().mockResolvedValue(undefined),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
  } as unknown as CompetitionsService;
  const leagues = zero() as unknown as LeaguesService;
  const rulesSets = zero() as unknown as RulesSetsService;
  const eras = {
    findById: vi.fn().mockResolvedValue(undefined),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
    countAll: vi.fn().mockResolvedValue(0),
    getRulesSetNames: vi.fn().mockResolvedValue([]),
    listErasWithLeague: vi.fn().mockResolvedValue([]),
  } as unknown as ErasService;
  const players = {
    countMvpAwardsByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 7 }]),
    countTouchdownsScoredByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 9 }]),
    countCompletionsByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 6 }]),
    countInterceptionsByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 5 }]),
    countDeflectionsByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 4 }]),
    countCasualtiesCausedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 11 }]),
    countSeriousInjuriesCausedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 3 }]),
    countDeathsCausedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 2 }]),
    countCasualtiesSufferedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 12 }]),
    countSeriousInjuriesSufferedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 5 }]),
    countLastingInjuriesSufferedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 4 }]),
    countFoulsCommittedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 6 }]),
    countTimesSentOffByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 5 }]),
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as PlayersService;
  const positions = zero() as unknown as PositionsService;
  const races = {
    countTeamsByRace: vi
      .fn()
      .mockResolvedValue([{ raceId: 1, name: 'Orc', count: 12 }]),
    countMatchesPlayedByRace: vi
      .fn()
      .mockResolvedValue([{ raceId: 1, name: 'Orc', count: 40 }]),
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as RacesService;
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
    players,
    eras,
    races,
    competitions,
    discordClient,
  };
}

function chatInput(
  category: string | null,
  era: string | null = null,
  competition: string | null = null,
): ChatInputCommandInteraction {
  return {
    options: {
      getString: vi.fn((name: string) =>
        name === 'era' ? era : name === 'competition' ? competition : category,
      ),
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

  it('resolves an exact leaf path to that fact, suffixed with "All time" when no era is given', async () => {
    const { service, coaches } = makeService();
    const result = await service.execute(
      chatInput('coach.toplist.matches.played'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played — All time',
          description: '1. Roze Madder — 9',
        },
      ],
    });
  });

  it('does not suffix a non-era-supporting fact (eras.list) when no era is given', async () => {
    const { service } = makeService();
    const result = await service.execute(chatInput('eras.list'));
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras',
          description: 'No data recorded yet.',
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
      {
        name: 'competition',
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

  it('rejects an era on a non-era-supporting category (eras.list)', async () => {
    const { service, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(chatInput('eras.list', '20'));
    expect(result).toBe(
      'Even the Assistant Coach cannot understand your request',
    );
  });

  it('restricts the random pick to era-supporting leaves when an era but no category is given', async () => {
    const { service, coaches, teams, players, races, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    // Force pickRandom to the last eligible leaf in the era-supporting pool
    // (stats is now era-supporting too, so it may legitimately be picked).
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const result = await service.execute(chatInput(null, '20'));
    // No matter which era-supporting leaf is chosen, the reply is never the
    // rejection message reserved for non-era-supporting categories.
    expect(result).not.toBe(
      'Even the Assistant Coach cannot understand your request',
    );
    const calledWithEra =
      (coaches.countMatchesPlayedByCoach as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (coaches.countTeamsByCoach as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countMatchesPlayedByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countCompetitionsByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (players.countMvpAwardsByPlayer as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (races.countTeamsByRace as ReturnType<typeof vi.fn>).mock.calls.length >
        0 ||
      (races.countMatchesPlayedByRace as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      // stats is era-supporting too; getRulesSetNames is only called from
      // the era-scoped stats path (eras.list opts out of era filtering).
      (eras.getRulesSetNames as ReturnType<typeof vi.fn>).mock.calls.length > 0;
    expect(calledWithEra).toBe(true);
  });

  it.each<{
    factPath: string;
    selectMock: (
      ctx: ReturnType<typeof makeService>,
    ) => ReturnType<typeof vi.fn>;
    expectedCallArgs: unknown[];
    expectedTitle: string;
    expectedDescription: string;
  }>([
    {
      factPath: 'team.toplist.competitions.played',
      selectMock: (ctx) =>
        // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
        ctx.teams.countCompetitionsByTeam as ReturnType<typeof vi.fn>,
      expectedCallArgs: [20],
      expectedTitle: 'Teams by competitions played — BB2020',
      expectedDescription: '1. 40 grinders — 4',
    },
    {
      factPath: 'coach.toplist.competitions.played',
      selectMock: (ctx) =>
        // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
        ctx.coaches.countCompetitionsByCoach as ReturnType<typeof vi.fn>,
      expectedCallArgs: [20],
      expectedTitle: 'Coaches by competitions played — BB2020',
      expectedDescription: '1. Roze Madder — 5',
    },
    {
      factPath: 'player.toplist.mvps',
      selectMock: (ctx) =>
        // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
        ctx.players.countMvpAwardsByPlayer as ReturnType<typeof vi.fn>,
      expectedCallArgs: [20, undefined],
      expectedTitle: 'Players by MVP awards — BB2020',
      expectedDescription: '1. Griff Oberwald — 7',
    },
    {
      factPath: 'race.toplist.teams',
      selectMock: (ctx) =>
        // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
        ctx.races.countTeamsByRace as ReturnType<typeof vi.fn>,
      expectedCallArgs: [20],
      expectedTitle: 'Races by teams — BB2020',
      expectedDescription: '1. Orc — 12',
    },
    {
      factPath: 'race.toplist.matches.played',
      selectMock: (ctx) =>
        // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
        ctx.races.countMatchesPlayedByRace as ReturnType<typeof vi.fn>,
      expectedCallArgs: [20],
      expectedTitle: 'Races by matches played — BB2020',
      expectedDescription: '1. Orc — 40',
    },
  ])(
    'scopes $factPath to the resolved era and names it in the title',
    async ({
      factPath,
      selectMock,
      expectedCallArgs,
      expectedTitle,
      expectedDescription,
    }) => {
      const ctx = makeService();
      (ctx.eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 20,
        name: 'BB2020',
      });
      const result = await ctx.service.execute(chatInput(factPath, '20'));
      expect(selectMock(ctx)).toHaveBeenCalledWith(...expectedCallArgs);
      expect(result).toEqual({
        embeds: [{ title: expectedTitle, description: expectedDescription }],
      });
    },
  );

  it('rejects an era on team.toplist.eras.active (not era-supporting)', async () => {
    const { service, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('team.toplist.eras.active', '20'),
    );
    expect(result).toBe(
      'Even the Assistant Coach cannot understand your request',
    );
  });

  it('excludes team.toplist.eras.active from the random pool when an era is given', async () => {
    const { service, teams, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    // Pin random to select the last eligible leaf; eras.active is filtered
    // out of the era-scoped pool, so countErasByTeam is never called.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.execute(chatInput(null, '20'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.countErasByTeam).not.toHaveBeenCalled();
  });

  it('resolves player.toplist.mvps with no era, suffixed with "All time"', async () => {
    const { service, players } = makeService();
    const result = await service.execute(chatInput('player.toplist.mvps'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countMvpAwardsByPlayer).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by MVP awards — All time',
          description: '1. Griff Oberwald — 7',
        },
      ],
    });
  });

  it('includes the race facts in the era-scoped random pool', async () => {
    const { service, races, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    // Every era-supporting leaf is in the pool, so at least one race query
    // must be reachable. Sweep [0,1) in fine steps (pickRandom uses
    // leaves[Math.floor(Math.random() * leaves.length)]) so every index is
    // hit at least once regardless of how many era-supporting leaves exist.
    const seen = new Set<string>();
    const sampleCount = 50;
    for (let i = 0; i < sampleCount; i++) {
      const r = i / sampleCount;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      await service.execute(chatInput(null, '20'));
      vi.restoreAllMocks();
      (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 20,
        name: 'BB2020',
      });
    }
    const teamsCalled =
      (races.countTeamsByRace as ReturnType<typeof vi.fn>).mock.calls.length >
      0;
    const matchesCalled =
      (races.countMatchesPlayedByRace as ReturnType<typeof vi.fn>).mock.calls
        .length > 0;
    seen.add(String(teamsCalled));
    seen.add(String(matchesCalled));
    expect(teamsCalled || matchesCalled).toBe(true);
  });

  it('rejects an era on coach.toplist.eras.active (not era-supporting)', async () => {
    const { service, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('coach.toplist.eras.active', '20'),
    );
    expect(result).toBe(
      'Even the Assistant Coach cannot understand your request',
    );
  });

  it('excludes coach.toplist.eras.active from the random pool when an era is given', async () => {
    const { service, coaches, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    // Pin random to select the last eligible leaf; eras.active is filtered
    // out of the era-scoped pool, so countErasByCoach is never called.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.execute(chatInput(null, '20'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(coaches.countErasByCoach).not.toHaveBeenCalled();
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

  it('passes the DB-timeout fallback string through unchanged when an era is given', async () => {
    vi.useFakeTimers();
    try {
      const { service, coaches, eras } = makeService();
      (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 20,
        name: 'BB2020',
      });
      (
        coaches.countMatchesPlayedByCoach as ReturnType<typeof vi.fn>
      ).mockReturnValue(new Promise(() => {}));

      const promise = service.execute(
        chatInput('coach.toplist.matches.played', '20'),
      );
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).resolves.toBe(DATABASE_TIMEOUT_FALLBACK_MESSAGE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes a reply with an empty embeds array through unchanged', () => {
    const { service } = makeService();
    const reply = { embeds: [] };

    const result = (
      service as unknown as {
        applyTitleSuffix: (reply: unknown, suffix: string) => unknown;
      }
    ).applyTitleSuffix(reply, 'BB2020');

    expect(result).toBe(reply);
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

  it('scopes player.toplist.touchdowns.scored to the resolved era and names it in the title', async () => {
    const { service, players, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('player.toplist.touchdowns.scored', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countTouchdownsScoredByPlayer).toHaveBeenCalledWith(
      20,
      undefined,
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by touchdowns scored — BB2020',
          description: '1. Griff Oberwald — 9',
        },
      ],
    });
  });

  it('resolves player.toplist.completions with no era, suffixed with "All time"', async () => {
    const { service, players } = makeService();
    const result = await service.execute(
      chatInput('player.toplist.completions'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countCompletionsByPlayer).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by completions — All time',
          description: '1. Griff Oberwald — 6',
        },
      ],
    });
  });

  it('scopes team.toplist.interceptions to the resolved era and names it in the title', async () => {
    const { service, teams, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('team.toplist.interceptions', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.countInterceptionsByTeam).toHaveBeenCalledWith(20, undefined);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by interceptions — BB2020',
          description: '1. 40 grinders — 5',
        },
      ],
    });
  });

  it('resolves team.toplist.deflections with no era, suffixed with "All time"', async () => {
    const { service, teams } = makeService();
    const result = await service.execute(chatInput('team.toplist.deflections'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.countDeflectionsByTeam).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by deflections — All time',
          description: '1. 40 grinders — 4',
        },
      ],
    });
  });

  it('includes the offense facts in the era-scoped random pool', async () => {
    const { service, players, teams, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    // Sweep [0,1); with 16 era-supporting leaves in the pool, at least one
    // offense query must be reachable across the sweep.
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.999999]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      await service.execute(chatInput(null, '20'));
      vi.restoreAllMocks();
      (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 20,
        name: 'BB2020',
      });
    }
    const anyOffenseCalled =
      (players.countTouchdownsScoredByPlayer as ReturnType<typeof vi.fn>).mock
        .calls.length > 0 ||
      (players.countCompletionsByPlayer as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (players.countInterceptionsByPlayer as ReturnType<typeof vi.fn>).mock
        .calls.length > 0 ||
      (players.countDeflectionsByPlayer as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countTouchdownsScoredByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countCompletionsByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countInterceptionsByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countDeflectionsByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0;
    expect(anyOffenseCalled).toBe(true);
  });

  it('scopes player.toplist.casualties.caused to the resolved era and names it in the title', async () => {
    const { service, players, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('player.toplist.casualties.caused', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countCasualtiesCausedByPlayer).toHaveBeenCalledWith(
      20,
      undefined,
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by casualties inflicted — BB2020',
          description: '1. Morg n Thorg — 11',
        },
      ],
    });
  });

  it('resolves player.toplist.sent_off with no era, suffixed with "All time"', async () => {
    const { service, players } = makeService();
    const result = await service.execute(chatInput('player.toplist.sent_off'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countTimesSentOffByPlayer).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by times sent off — All time',
          description: '1. Morg n Thorg — 5',
        },
      ],
    });
  });

  it('scopes team.toplist.injuries.serious.caused to the resolved era and names it in the title', async () => {
    const { service, teams, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('team.toplist.injuries.serious.caused', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.countSeriousInjuriesCausedByTeam).toHaveBeenCalledWith(
      20,
      undefined,
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by serious injuries inflicted — BB2020',
          description: '1. 40 grinders — 7',
        },
      ],
    });
  });

  it('includes the violence facts in the era-scoped random pool', async () => {
    const { service, players, teams, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    // Sweep [0,1) in fine steps so every era-supporting leaf index is hit;
    // at least one violence/discipline query must be reachable.
    const sampleCount = 60;
    for (let i = 0; i < sampleCount; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / sampleCount);
      await service.execute(chatInput(null, '20'));
      vi.restoreAllMocks();
      (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 20,
        name: 'BB2020',
      });
    }
    const anyViolenceCalled =
      (players.countCasualtiesCausedByPlayer as ReturnType<typeof vi.fn>).mock
        .calls.length > 0 ||
      (players.countSeriousInjuriesCausedByPlayer as ReturnType<typeof vi.fn>)
        .mock.calls.length > 0 ||
      (players.countDeathsCausedByPlayer as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (players.countFoulsCommittedByPlayer as ReturnType<typeof vi.fn>).mock
        .calls.length > 0 ||
      (players.countTimesSentOffByPlayer as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countCasualtiesCausedByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countSeriousInjuriesCausedByTeam as ReturnType<typeof vi.fn>).mock
        .calls.length > 0 ||
      (teams.countDeathsCausedByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countFoulsCommittedByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (teams.countTimesSentOffByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0;
    expect(anyViolenceCalled).toBe(true);
  });

  it('scopes player.toplist.casualties.suffered to the resolved era and names it in the title', async () => {
    const { service, players, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('player.toplist.casualties.suffered', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countCasualtiesSufferedByPlayer).toHaveBeenCalledWith(
      20,
      undefined,
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by casualties suffered — BB2020',
          description: '1. Griff Oberwald — 12',
        },
      ],
    });
  });

  it('scopes team.toplist.injuries.lasting.suffered to the resolved era and names it in the title', async () => {
    const { service, teams, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('team.toplist.injuries.lasting.suffered', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.countLastingInjuriesSufferedByTeam).toHaveBeenCalledWith(
      20,
      undefined,
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by lasting injuries suffered — BB2020',
          description: '1. 40 grinders — 4',
        },
      ],
    });
  });

  it('resolves team.toplist.deaths.suffered with no era, suffixed with "All time"', async () => {
    const { service, teams } = makeService();
    const result = await service.execute(
      chatInput('team.toplist.deaths.suffered'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.countDeathsSufferedByTeam).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by deaths suffered — All time',
          description: '1. 40 grinders — 2',
        },
      ],
    });
  });

  it('includes the injuries-suffered facts in the era-scoped random pool', async () => {
    const { service, players, teams, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    // Sweep [0,1) in fine steps so every era-supporting leaf index is hit;
    // at least one injuries-suffered query must be reachable.
    const sampleCount = 60;
    for (let i = 0; i < sampleCount; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / sampleCount);
      await service.execute(chatInput(null, '20'));
      vi.restoreAllMocks();
      (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 20,
        name: 'BB2020',
      });
    }
    const anySufferedCalled =
      (players.countCasualtiesSufferedByPlayer as ReturnType<typeof vi.fn>).mock
        .calls.length > 0 ||
      (players.countSeriousInjuriesSufferedByPlayer as ReturnType<typeof vi.fn>)
        .mock.calls.length > 0 ||
      (players.countLastingInjuriesSufferedByPlayer as ReturnType<typeof vi.fn>)
        .mock.calls.length > 0 ||
      (teams.countCasualtiesSufferedByTeam as ReturnType<typeof vi.fn>).mock
        .calls.length > 0 ||
      (teams.countSeriousInjuriesSufferedByTeam as ReturnType<typeof vi.fn>)
        .mock.calls.length > 0 ||
      (teams.countLastingInjuriesSufferedByTeam as ReturnType<typeof vi.fn>)
        .mock.calls.length > 0 ||
      (teams.countDeathsSufferedByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0;
    expect(anySufferedCalled).toBe(true);
  });

  it('advertises a competition option alongside category and era', () => {
    const { service } = makeService();
    const command = service.buildCommand();
    expect(command.options).toHaveLength(3);
    expect(command.options?.[2]).toEqual({
      name: 'competition',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
      description: expect.any(String),
      type: 3,
      autocomplete: true,
    });
  });

  it('rejects a request that supplies both an era and a competition', async () => {
    const { service, eras, competitions } = makeService();
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', '20', '30'),
    );
    expect(result).toBe('The referee rejects your request');
    // mutual exclusion is checked before any lookup
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(eras.findById).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(competitions.findById).not.toHaveBeenCalled();
  });

  it('rejects a competition id that does not resolve to a real competition', async () => {
    const { service, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    const result = await service.execute(
      chatInput('team.toplist.competitions.played', null, '999'),
    );
    expect(result).toBe(
      "Even the League Secretary can't find that competition in the fixture list.",
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(competitions.findById).toHaveBeenCalledWith(999);
  });

  it('scopes an in-scope category to the resolved competition and names it in the title', async () => {
    const { service, teams, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 30,
      name: 'Major Season 24',
      type: 'season',
      eraId: 5,
    });
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', null, '30'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(teams.countTouchdownsScoredByTeam).toHaveBeenCalledWith(
      undefined,
      30,
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by touchdowns scored — Major Season 24',
          description: '1. 40 grinders — 15',
        },
      ],
    });
  });

  it('rejects a competition on a category that does not support it (coach.toplist.competitions.played)', async () => {
    const { service, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 30,
      name: 'Major Season 24',
      type: 'season',
      eraId: 5,
    });
    const result = await service.execute(
      chatInput('coach.toplist.competitions.played', null, '30'),
    );
    expect(result).toBe(
      "Even the Ref's assistant can't scope that to a competition.",
    );
  });

  it('rejects a competition on eras.list (not competition-supporting)', async () => {
    const { service, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 30,
      name: 'Major Season 24',
      type: 'season',
      eraId: 5,
    });
    const result = await service.execute(chatInput('eras.list', null, '30'));
    expect(result).toBe(
      "Even the Ref's assistant can't scope that to a competition.",
    );
  });

  it('restricts the random pick to competition-supporting leaves when a competition but no category is given', async () => {
    const { service, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 30,
      name: 'Major Season 24',
      type: 'season',
      eraId: 5,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const result = await service.execute(chatInput(null, null, '30'));
    expect(result).not.toBe(
      "Even the Ref's assistant can't scope that to a competition.",
    );
  });

  it('returns competition autocomplete choices labelled "<name> (<league>)" with id values', async () => {
    const { service, competitions } = makeService();
    (
      competitions.searchByNamePrefix as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { id: 30, name: 'Major Season 24', leagueName: 'The Major' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('competition', 'maj'),
    );
    expect(choices).toEqual([
      { name: 'Major Season 24 (The Major)', value: '30' },
    ]);
  });
});
