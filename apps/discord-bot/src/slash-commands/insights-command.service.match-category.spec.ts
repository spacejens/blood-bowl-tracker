import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_MATCH_CATEGORY_MESSAGE,
  INSIGHTS_SCOPE_CONFLICT_MESSAGE,
} from '../error-messages';
import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — match category scoping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a request that supplies both a league and a match category', async () => {
    const { service, leagues } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', {
        league: '9',
        matchCategory: 'season_final',
      }),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
    expect(leagues.findById).not.toHaveBeenCalled();
  });

  it('rejects a request that supplies both an era and a match category', async () => {
    const { service, eras } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', {
        era: '20',
        matchCategory: 'season_final',
      }),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
    expect(eras.findById).not.toHaveBeenCalled();
  });

  it('rejects a request that supplies both a competition and a match category', async () => {
    const { service, competitions } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', {
        competition: '30',
        matchCategory: 'season_final',
      }),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
    expect(competitions.findById).not.toHaveBeenCalled();
  });

  it('rejects a request that supplies all four scope options', async () => {
    const { service } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', {
        league: '9',
        era: '20',
        competition: '30',
        matchCategory: 'season_final',
      }),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
  });

  it('scopes an in-scope category to the match category and names it in the title', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', {
        matchCategory: 'season_final',
      }),
    );
    expect(
      factTreeDeps.teamToplist.resolveTouchdownsScored,
    ).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: undefined,
      competitionId: undefined,
      category: 'season_final',
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by touchdowns scored — Label for season_final',
          description: '1. 40 grinders — 15',
        },
      ],
      components: [],
    });
  });

  it('scopes a coach toplist that supports no competition but does support a match category', async () => {
    const { service, factTreeDeps } = await makeService();
    await service.execute(
      chatInput('coach.toplist.matches.played', {
        matchCategory: 'cup_final',
      }),
    );
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalledWith(
      {
        leagueId: undefined,
        eraId: undefined,
        competitionId: undefined,
        category: 'cup_final',
      },
    );
  });

  it('rejects a match category on a category that does not support it (coach.toplist.teams)', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(
      chatInput('coach.toplist.teams', { matchCategory: 'season_final' }),
    );
    expect(result).toBe(
      INSIGHTS_CATEGORY_UNSUPPORTED_FOR_MATCH_CATEGORY_MESSAGE,
    );
    expect(factTreeDeps.coachToplist.resolveTeams).not.toHaveBeenCalled();
  });

  it('rejects a match category on stats', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(
      chatInput('stats', { matchCategory: 'season_final' }),
    );
    expect(result).toBe(
      INSIGHTS_CATEGORY_UNSUPPORTED_FOR_MATCH_CATEGORY_MESSAGE,
    );
    expect(factTreeDeps.statsSummary.resolve).not.toHaveBeenCalled();
  });

  it('picks only match-category-capable leaves from a branch path', async () => {
    const { service, factTreeDeps } = await makeService();
    for (let i = 0; i < 20; i++) {
      await service.execute(
        chatInput('coach.toplist', { matchCategory: 'season_final' }),
      );
    }
    expect(factTreeDeps.coachToplist.resolveTeams).not.toHaveBeenCalled();
    expect(factTreeDeps.coachToplist.resolveErasActive).not.toHaveBeenCalled();
  });

  it('restricts a random fact to match-category-capable leaves', async () => {
    const { service, factTreeDeps } = await makeService();
    for (let i = 0; i < 40; i++) {
      await service.execute(chatInput(null, { matchCategory: 'cup_final' }));
    }
    expect(factTreeDeps.erasList.resolve).not.toHaveBeenCalled();
    expect(factTreeDeps.statsSummary.resolve).not.toHaveBeenCalled();
    expect(factTreeDeps.raceToplist.resolveTeams).not.toHaveBeenCalled();
  });

  it('treats an unrecognised match-category value as no match-category scope', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(
      chatInput('stats', { matchCategory: 'not_a_category' }),
    );
    expect(factTreeDeps.statsSummary.resolve).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: undefined,
      competitionId: undefined,
      category: undefined,
    });
    expect(result).toEqual({
      embeds: [
        { title: 'Stats summary — All time', description: 'sample stats' },
      ],
      components: [],
    });
  });
});
