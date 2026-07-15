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
  const zero = () => ({ countAll: vi.fn().mockResolvedValue(0) });
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
    countAll: vi.fn().mockResolvedValue(0),
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

  it('does not suffix a non-era-supporting fact (stats) when no era is given', async () => {
    const { service } = makeService();
    const result = await service.execute(chatInput('stats'));
    expect(result).toEqual({
      embeds: [
        {
          title: 'I have knowledge of',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
          description: expect.any(String),
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
    const { service, coaches, teams, players, races, eras } = makeService();
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
        .length > 0 ||
      (teams.countCompetitionsByTeam as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (players.countMvpAwardsByPlayer as ReturnType<typeof vi.fn>).mock.calls
        .length > 0 ||
      (races.countTeamsByRace as ReturnType<typeof vi.fn>).mock.calls.length >
        0 ||
      (races.countMatchesPlayedByRace as ReturnType<typeof vi.fn>).mock.calls
        .length > 0;
    expect(calledWithEra).toBe(true);
  });

  it('scopes team.toplist.competitions.played to the resolved era', async () => {
    const { service, teams, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('team.toplist.competitions.played', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.countCompetitionsByTeam).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by competitions played — BB2020',
          description: '1. 40 grinders — 4',
        },
      ],
    });
  });

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

  it('scopes coach.toplist.competitions.played to the resolved era', async () => {
    const { service, coaches, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('coach.toplist.competitions.played', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(coaches.countCompetitionsByCoach).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by competitions played — BB2020',
          description: '1. Roze Madder — 5',
        },
      ],
    });
  });

  it('scopes player.toplist.mvps to the resolved era and names it in the title', async () => {
    const { service, players, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('player.toplist.mvps', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countMvpAwardsByPlayer).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by MVP awards — BB2020',
          description: '1. Griff Oberwald — 7',
        },
      ],
    });
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

  it('scopes race.toplist.teams to the resolved era and names it in the title', async () => {
    const { service, races, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(chatInput('race.toplist.teams', '20'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(races.countTeamsByRace).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Races by teams — BB2020',
          description: '1. Orc — 12',
        },
      ],
    });
  });

  it('scopes race.toplist.matches.played to the resolved era and names it in the title', async () => {
    const { service, races, eras } = makeService();
    (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 20,
      name: 'BB2020',
    });
    const result = await service.execute(
      chatInput('race.toplist.matches.played', '20'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(races.countMatchesPlayedByRace).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Races by matches played — BB2020',
          description: '1. Orc — 40',
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
    // Pin random to the last eligible leaf; every era-supporting leaf is in
    // the pool, so at least one race query must be reachable. Sweep the whole
    // [0,1) space to prove both race leaves are era-supporting members.
    const seen = new Set<string>();
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
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
    expect(players.countTouchdownsScoredByPlayer).toHaveBeenCalledWith(20);
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
    expect(teams.countInterceptionsByTeam).toHaveBeenCalledWith(20);
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
});
