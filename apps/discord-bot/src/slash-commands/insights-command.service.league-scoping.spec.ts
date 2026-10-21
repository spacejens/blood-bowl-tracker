import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_LEAGUE_MESSAGE,
  INSIGHTS_LEAGUE_NOT_FOUND_MESSAGE,
  INSIGHTS_SCOPE_CONFLICT_MESSAGE,
} from '../error-messages';
import type { MakeServiceResult } from './insights-command.service.test-helpers';
import {
  asLeaf,
  autocompleteInteraction,
  chatInput,
  makeService,
  stubLeafCategory,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — league scoping and rejection', () => {
  let harness: MakeServiceResult;

  beforeEach(async () => {
    harness = await makeService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scopes a league-supporting category to the league and names it in the title', async () => {
    const { service, factTreeDeps, factTreeNavigation, leagues, tree } =
      harness;
    stubLeafCategory(
      factTreeNavigation,
      asLeaf(tree.coach.toplist.matches.played),
    );
    leagues.findById.mockResolvedValue({ id: 5, name: 'GBBL' });
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', { league: '5' }),
    );
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalledWith(
      { leagueId: 5, eraId: undefined, competitionId: undefined },
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played — GBBL',
          description: '1. Roze Madder — 9',
        },
      ],
      components: [],
    });
  });

  it('scopes eras.list to the league and names it in the title', async () => {
    const { service, factTreeDeps, factTreeNavigation, leagues, tree } =
      harness;
    stubLeafCategory(factTreeNavigation, asLeaf(tree.eras.list));
    leagues.findById.mockResolvedValue({ id: 5, name: 'GBBL' });
    const result = await service.execute(
      chatInput('eras.list', { league: '5' }),
    );
    expect(factTreeDeps.erasList.resolve).toHaveBeenCalledWith({
      leagueId: 5,
      eraId: undefined,
      competitionId: undefined,
    });
    expect(result).toEqual(
      expect.objectContaining({
        embeds: [
          {
            title: 'Eras — GBBL',
            description: expect.any(String) as unknown,
          },
        ],
      }),
    );
  });

  it('restricts the random pick to league-supporting leaves', async () => {
    const {
      service,
      factTreeDeps,
      factTreeNavigation,
      factTree,
      leagues,
      tree,
    } = harness;
    leagues.findById.mockResolvedValue({ id: 5, name: 'GBBL' });
    factTreeNavigation.collectLeaves.mockReturnValue([
      asLeaf(tree.coach.toplist.eras.active), // supportsLeague: false
      asLeaf(tree.coach.toplist.matches.played), // supportsLeague: true
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0); // deterministic pick
    await service.execute(chatInput(null, { league: '5' }));
    expect(factTreeNavigation.collectLeaves).toHaveBeenCalledWith(factTree);
    expect(factTreeDeps.coachToplist.resolveErasActive).not.toHaveBeenCalled();
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalledWith(
      { leagueId: 5, eraId: undefined, competitionId: undefined },
    );
  });

  it('rejects a league on a non-league-supporting category (coach.toplist.eras.active)', async () => {
    const { service, factTreeNavigation, leagues, tree } = harness;
    stubLeafCategory(
      factTreeNavigation,
      asLeaf(tree.coach.toplist.eras.active),
    );
    leagues.findById.mockResolvedValue({ id: 5, name: 'GBBL' });
    const result = await service.execute(
      chatInput('coach.toplist.eras.active', { league: '5' }),
    );
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_LEAGUE_MESSAGE);
  });

  it('rejects a league id that resolves to no league', async () => {
    const { service, leagues } = harness;
    leagues.findById.mockResolvedValue(undefined);
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', { league: '999' }),
    );
    expect(result).toBe(INSIGHTS_LEAGUE_NOT_FOUND_MESSAGE);
  });

  it('autocompletes leagues with name-only labels and id values', async () => {
    const { service, leagues } = harness;
    leagues.searchByNamePrefix.mockResolvedValue([
      { id: 5, name: 'GBBL' },
      { id: 6, name: 'GBBL North' },
    ]);
    const choices = await service.autocomplete(
      autocompleteInteraction('league', 'GB'),
    );
    expect(choices).toEqual([
      { name: 'GBBL', value: '5' },
      { name: 'GBBL North', value: '6' },
    ]);
  });

  it.each([
    ['era+league', { era: '1', league: '5' }],
    ['competition+league', { competition: '2', league: '5' }],
    ['all three', { era: '1', competition: '2', league: '5' }],
  ])('rejects %s with the conflict message', async (_label, scope) => {
    const { service } = harness;
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', scope),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
  });
});
