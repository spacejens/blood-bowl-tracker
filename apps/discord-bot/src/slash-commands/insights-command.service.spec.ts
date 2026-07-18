import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE,
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE,
  INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE,
  INSIGHTS_ERA_COMPETITION_CONFLICT_MESSAGE,
  INSIGHTS_ERA_NOT_FOUND_MESSAGE,
} from '../error-messages';
import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE);
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
    expect(result).not.toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE);
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
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE);
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
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE);
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
    expect(result).toBe(INSIGHTS_ERA_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(eras.findById).toHaveBeenCalledWith(999);
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

  it('rejects a request that supplies both an era and a competition', async () => {
    const { service, eras, competitions } = makeService();
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', '20', '30'),
    );
    expect(result).toBe(INSIGHTS_ERA_COMPETITION_CONFLICT_MESSAGE);
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
    expect(result).toBe(INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE);
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
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE);
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
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE);
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
      INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE,
    );
  });
});
