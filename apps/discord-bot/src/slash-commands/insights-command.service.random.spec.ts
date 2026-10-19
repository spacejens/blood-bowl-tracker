import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MakeServiceResult } from './insights-command.service.test-helpers';
import {
  asLeaf,
  asNode,
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

const ERA = {
  id: 20,
  name: 'BB2020',
  startDate: '2020-01-01',
  endDate: null,
};

describe('InsightsCommandService — random pick', () => {
  let harness: MakeServiceResult;

  beforeEach(async () => {
    harness = await makeService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks a random leaf under a branch path', async () => {
    const { service, factTreeDeps, factTreeUtils, factTree, tree } = harness;
    factTreeUtils.resolvePath.mockReturnValue(asNode(tree.coach));
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.coach.toplist.matches.played),
      asLeaf(tree.coach.toplist.matches.won),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput('coach'));
    expect(factTreeUtils.resolvePath).toHaveBeenCalledWith(factTree, 'coach');
    expect(factTreeUtils.collectLeaves).toHaveBeenCalledWith(
      asNode(tree.coach),
    );
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('picks a random leaf across the whole tree when no category is given', async () => {
    const { service, factTreeDeps, factTreeUtils, factTree, tree } = harness;
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.coach.toplist.matches.played),
      asLeaf(tree.stats),
    ]);
    // Math.random 0.999999 selects the last element of the pool (stats).
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.execute(chatInput(null));
    expect(factTreeUtils.collectLeaves).toHaveBeenCalledWith(factTree);
    expect(factTreeDeps.statsSummary.resolve).toHaveBeenCalled();
  });

  it('resolveRandomFact picks a random leaf across the whole tree', async () => {
    const { service, factTreeDeps, factTreeUtils, factTree, tree } = harness;
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.coach.toplist.matches.played),
      asLeaf(tree.stats),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.resolveRandomFact({});
    expect(factTreeUtils.collectLeaves).toHaveBeenCalledWith(factTree);
    expect(factTreeDeps.statsSummary.resolve).toHaveBeenCalled();
  });

  it('restricts the random pick to era-supporting leaves when an era but no category is given', async () => {
    const { service, factTreeDeps, factTreeUtils, eras, tree } = harness;
    eras.findById.mockResolvedValue(ERA);
    // eras.list does not support era scoping, so the filtered pool is just
    // [stats] and the last element of the filtered pool is stats.
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.stats),
      asLeaf(tree.eras.list),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.execute(chatInput(null, { era: '20' }));
    expect(factTreeDeps.statsSummary.resolve).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
    expect(factTreeDeps.erasList.resolve).not.toHaveBeenCalled();
  });

  it('excludes team.toplist.eras.active from the random pool when an era is given', async () => {
    const { service, factTreeDeps, factTreeUtils, eras, tree } = harness;
    eras.findById.mockResolvedValue(ERA);
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.team.toplist.matches.played),
      asLeaf(tree.team.toplist.eras.active),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.execute(chatInput(null, { era: '20' }));
    expect(factTreeDeps.teamToplist.resolveErasActive).not.toHaveBeenCalled();
    expect(factTreeDeps.teamToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('includes the race facts in the era-scoped random pool', async () => {
    const { service, factTreeDeps, factTreeUtils, eras, tree } = harness;
    eras.findById.mockResolvedValue(ERA);
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.coach.toplist.eras.active),
      asLeaf(tree.race.toplist.matches.played),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput(null, { era: '20' }));
    expect(factTreeDeps.raceToplist.resolveMatchesPlayed).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
  });

  it('excludes coach.toplist.eras.active from the random pool when an era is given', async () => {
    const { service, factTreeDeps, factTreeUtils, eras, tree } = harness;
    eras.findById.mockResolvedValue(ERA);
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.coach.toplist.matches.played),
      asLeaf(tree.coach.toplist.eras.active),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.execute(chatInput(null, { era: '20' }));
    expect(factTreeDeps.coachToplist.resolveErasActive).not.toHaveBeenCalled();
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('includes the offense facts in the era-scoped random pool', async () => {
    const { service, factTreeDeps, factTreeUtils, eras, tree } = harness;
    eras.findById.mockResolvedValue(ERA);
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.coach.toplist.eras.active),
      asLeaf(tree.player.toplist.touchdowns.scored),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput(null, { era: '20' }));
    expect(
      factTreeDeps.playerToplist.resolveTouchdownsScored,
    ).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
  });

  it('includes the violence facts in the era-scoped random pool', async () => {
    const { service, factTreeDeps, factTreeUtils, eras, tree } = harness;
    eras.findById.mockResolvedValue(ERA);
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.coach.toplist.eras.active),
      asLeaf(tree.player.toplist.casualties.caused),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput(null, { era: '20' }));
    expect(
      factTreeDeps.playerToplist.resolveCasualtiesCaused,
    ).toHaveBeenCalled();
  });

  it('includes the injuries-suffered facts in the era-scoped random pool', async () => {
    const { service, factTreeDeps, factTreeUtils, eras, tree } = harness;
    eras.findById.mockResolvedValue(ERA);
    factTreeUtils.collectLeaves.mockReturnValue([
      asLeaf(tree.coach.toplist.eras.active),
      asLeaf(tree.team.toplist.injuries.lasting.suffered),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput(null, { era: '20' }));
    expect(
      factTreeDeps.teamToplist.resolveLastingInjuriesSuffered,
    ).toHaveBeenCalled();
  });
});
