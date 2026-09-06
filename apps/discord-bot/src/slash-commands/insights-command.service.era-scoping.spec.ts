import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE,
  INSIGHTS_ERA_NOT_FOUND_MESSAGE,
} from '../error-messages';
import type { FactTreeMocks } from './insights-command.service.test-helpers';
import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — era scoping and rejection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scopes an era-supporting category to the resolved era and names it in the title', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', { era: '20' }),
    );
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalledWith(
      { leagueId: undefined, eraId: 20, competitionId: undefined },
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played — BB2020',
          description: '1. Roze Madder — 9',
        },
      ],
      components: [],
    });
  });

  it('rejects an era on a non-era-supporting category (eras.list)', async () => {
    const { service, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(chatInput('eras.list', { era: '20' }));
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE);
  });

  it.each<{
    factPath: string;
    selectMock: (deps: FactTreeMocks) => { mock: { calls: unknown[][] } };
    expectedTitle: string;
    expectedDescription: string;
  }>([
    {
      factPath: 'team.toplist.competitions.played',
      selectMock: (deps) => deps.teamToplist.resolveCompetitionsPlayed,
      expectedTitle: 'Teams by competitions played — BB2020',
      expectedDescription: '1. 40 grinders — 4',
    },
    {
      factPath: 'coach.toplist.competitions.played',
      selectMock: (deps) => deps.coachToplist.resolveCompetitionsPlayed,
      expectedTitle: 'Coaches by competitions played — BB2020',
      expectedDescription: '1. Roze Madder — 5',
    },
    {
      factPath: 'player.toplist.mvps',
      selectMock: (deps) => deps.playerToplist.resolveMvps,
      expectedTitle: 'Players by MVP awards — BB2020',
      expectedDescription: '1. Griff Oberwald — 7',
    },
    {
      factPath: 'race.toplist.teams.descending',
      selectMock: (deps) => deps.raceToplist.resolveTeamsDescending,
      expectedTitle: 'Races by teams (descending) — BB2020',
      expectedDescription: '1. Orc — 12',
    },
    {
      factPath: 'race.toplist.teams.ascending',
      selectMock: (deps) => deps.raceToplist.resolveTeamsAscending,
      expectedTitle: 'Races by teams (ascending) — BB2020',
      expectedDescription: '1. Halfling — 0',
    },
    {
      factPath: 'race.toplist.matches.played',
      selectMock: (deps) => deps.raceToplist.resolveMatchesPlayed,
      expectedTitle: 'Races by matches played — BB2020',
      expectedDescription: '1. Orc — 40',
    },
  ])(
    'scopes $factPath to the resolved era and names it in the title',
    async ({ factPath, selectMock, expectedTitle, expectedDescription }) => {
      const { service, factTreeDeps, eras } = await makeService();
      eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
      const result = await service.execute(chatInput(factPath, { era: '20' }));
      expect(selectMock(factTreeDeps).mock.calls).toEqual([
        [{ leagueId: undefined, eraId: 20, competitionId: undefined }],
      ]);
      expect(result).toEqual({
        embeds: [{ title: expectedTitle, description: expectedDescription }],
        components: [],
      });
    },
  );

  it('rejects an era on team.toplist.eras.active (not era-supporting)', async () => {
    const { service, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(
      chatInput('team.toplist.eras.active', { era: '20' }),
    );
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE);
  });

  it('rejects an era on coach.toplist.eras.active (not era-supporting)', async () => {
    const { service, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(
      chatInput('coach.toplist.eras.active', { era: '20' }),
    );
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE);
  });

  it('rejects an era id that does not resolve to a real era', async () => {
    const { service, eras } = await makeService();
    eras.findById.mockResolvedValue(undefined);
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', { era: '999' }),
    );
    expect(result).toBe(INSIGHTS_ERA_NOT_FOUND_MESSAGE);
    expect(eras.findById).toHaveBeenCalledWith(999);
  });

  it('scopes player.toplist.touchdowns.scored to the resolved era and names it in the title', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(
      chatInput('player.toplist.touchdowns.scored', { era: '20' }),
    );
    expect(
      factTreeDeps.playerToplist.resolveTouchdownsScored,
    ).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by touchdowns scored — BB2020',
          description: '1. Griff Oberwald — 9',
        },
      ],
      components: [],
    });
  });

  it('scopes team.toplist.interceptions to the resolved era and names it in the title', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(
      chatInput('team.toplist.interceptions', { era: '20' }),
    );
    expect(factTreeDeps.teamToplist.resolveInterceptions).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by interceptions — BB2020',
          description: '1. 40 grinders — 5',
        },
      ],
      components: [],
    });
  });

  it('scopes player.toplist.casualties.caused to the resolved era and names it in the title', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(
      chatInput('player.toplist.casualties.caused', { era: '20' }),
    );
    expect(
      factTreeDeps.playerToplist.resolveCasualtiesCaused,
    ).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by casualties inflicted — BB2020',
          description: '1. Morg n Thorg — 11',
        },
      ],
      components: [],
    });
  });

  it('scopes team.toplist.injuries.serious.caused to the resolved era and names it in the title', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(
      chatInput('team.toplist.injuries.serious.caused', { era: '20' }),
    );
    expect(
      factTreeDeps.teamToplist.resolveSeriousInjuriesCaused,
    ).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by serious injuries inflicted — BB2020',
          description: '1. 40 grinders — 7',
        },
      ],
      components: [],
    });
  });

  it('scopes player.toplist.casualties.suffered to the resolved era and names it in the title', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(
      chatInput('player.toplist.casualties.suffered', { era: '20' }),
    );
    expect(
      factTreeDeps.playerToplist.resolveCasualtiesSuffered,
    ).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by casualties suffered — BB2020',
          description: '1. Griff Oberwald — 12',
        },
      ],
      components: [],
    });
  });

  it('scopes team.toplist.injuries.lasting.suffered to the resolved era and names it in the title', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const result = await service.execute(
      chatInput('team.toplist.injuries.lasting.suffered', { era: '20' }),
    );
    expect(
      factTreeDeps.teamToplist.resolveLastingInjuriesSuffered,
    ).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by lasting injuries suffered — BB2020',
          description: '1. 40 grinders — 4',
        },
      ],
      components: [],
    });
  });
});
