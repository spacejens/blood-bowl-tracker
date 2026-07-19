import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE,
  INSIGHTS_ERA_NOT_FOUND_MESSAGE,
} from '../error-messages';
import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — era scoping and rejection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(result).toEqual(
      expect.objectContaining({
        embeds: [
          {
            title: 'Coaches by matches played — BB2020',
            description: '1. Roze Madder — 9',
          },
        ],
        components: expect.any(Array) as unknown,
      }),
    );
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
      const factIsCoachToplist = factPath.startsWith('coach.toplist');
      if (factIsCoachToplist) {
        expect(result).toEqual(
          expect.objectContaining({
            embeds: [
              { title: expectedTitle, description: expectedDescription },
            ],
            components: expect.any(Array) as unknown,
          }),
        );
      } else {
        expect(result).toEqual({
          embeds: [{ title: expectedTitle, description: expectedDescription }],
        });
      }
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
});
