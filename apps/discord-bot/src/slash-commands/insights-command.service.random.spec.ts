import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — random pick', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks a random leaf under a branch path', async () => {
    const { service, factTreeDeps } = await makeService();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput('coach'));
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('picks a random leaf across the whole tree when no category is given', async () => {
    const { service, factTreeDeps } = await makeService();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.execute(chatInput(null));
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('resolveRandomFact picks a random leaf across the whole tree', async () => {
    const { service, factTreeDeps } = await makeService();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.resolveRandomFact({});
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('restricts the random pick to era-supporting leaves when an era but no category is given', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    // The real fact tree has exactly 36 era-supporting leaves (verified by
    // walking fact-tree.ts); with pickRandom using
    // leaves[Math.floor(Math.random() * leaves.length)], 0.999999 lands
    // deterministically on the last one — "stats", the sole leaf added
    // after the "eras" branch (which has no era-supporting leaves).
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.execute(chatInput(null, { era: '20' }));
    expect(factTreeDeps.statsSummary.resolve).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: 20,
      competitionId: undefined,
    });
  });

  it('excludes team.toplist.eras.active from the random pool when an era is given', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    // Pin random to select the last eligible leaf; eras.active is filtered
    // out of the era-scoped pool, so resolveErasActive is never called.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.execute(chatInput(null, { era: '20' }));
    expect(factTreeDeps.teamToplist.resolveErasActive).not.toHaveBeenCalled();
  });

  it('includes the race facts in the era-scoped random pool', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    // Every era-supporting leaf is in the pool, so at least one race query
    // must be reachable. Sweep [0,1) in fine steps (pickRandom uses
    // leaves[Math.floor(Math.random() * leaves.length)]) so every index is
    // hit at least once regardless of how many era-supporting leaves exist.
    const sampleCount = 50;
    for (let i = 0; i < sampleCount; i++) {
      const r = i / sampleCount;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      await service.execute(chatInput(null, { era: '20' }));
      vi.restoreAllMocks();
      eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    }
    const teamsCalled =
      factTreeDeps.raceToplist.resolveTeams.mock.calls.length > 0;
    const matchesCalled =
      factTreeDeps.raceToplist.resolveMatchesPlayed.mock.calls.length > 0;
    expect(teamsCalled || matchesCalled).toBe(true);
  });

  it('excludes coach.toplist.eras.active from the random pool when an era is given', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    // Pin random to select the last eligible leaf; eras.active is filtered
    // out of the era-scoped pool, so resolveErasActive is never called.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    await service.execute(chatInput(null, { era: '20' }));
    expect(factTreeDeps.coachToplist.resolveErasActive).not.toHaveBeenCalled();
  });

  it('includes the offense facts in the era-scoped random pool', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    // Sweep [0,1); with many era-supporting leaves in the pool, at least one
    // offense query must be reachable across the sweep.
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.999999]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      await service.execute(chatInput(null, { era: '20' }));
      vi.restoreAllMocks();
      eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    }
    const anyOffenseCalled =
      factTreeDeps.playerToplist.resolveTouchdownsScored.mock.calls.length >
        0 ||
      factTreeDeps.playerToplist.resolveCompletions.mock.calls.length > 0 ||
      factTreeDeps.playerToplist.resolveInterceptions.mock.calls.length > 0 ||
      factTreeDeps.playerToplist.resolveDeflections.mock.calls.length > 0 ||
      factTreeDeps.teamToplist.resolveTouchdownsScored.mock.calls.length > 0 ||
      factTreeDeps.teamToplist.resolveCompletions.mock.calls.length > 0 ||
      factTreeDeps.teamToplist.resolveInterceptions.mock.calls.length > 0 ||
      factTreeDeps.teamToplist.resolveDeflections.mock.calls.length > 0;
    expect(anyOffenseCalled).toBe(true);
  });

  it('includes the violence facts in the era-scoped random pool', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    // Sweep [0,1) in fine steps so every era-supporting leaf index is hit;
    // at least one violence/discipline query must be reachable.
    const sampleCount = 60;
    for (let i = 0; i < sampleCount; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / sampleCount);
      await service.execute(chatInput(null, { era: '20' }));
      vi.restoreAllMocks();
      eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    }
    const anyViolenceCalled =
      factTreeDeps.playerToplist.resolveCasualtiesCaused.mock.calls.length >
        0 ||
      factTreeDeps.playerToplist.resolveSeriousInjuriesCaused.mock.calls
        .length > 0 ||
      factTreeDeps.playerToplist.resolveDeathsCaused.mock.calls.length > 0 ||
      factTreeDeps.playerToplist.resolveFoulsCommitted.mock.calls.length > 0 ||
      factTreeDeps.playerToplist.resolveTimesSentOff.mock.calls.length > 0 ||
      factTreeDeps.teamToplist.resolveCasualtiesCaused.mock.calls.length > 0 ||
      factTreeDeps.teamToplist.resolveSeriousInjuriesCaused.mock.calls.length >
        0 ||
      factTreeDeps.teamToplist.resolveDeathsCaused.mock.calls.length > 0 ||
      factTreeDeps.teamToplist.resolveFoulsCommitted.mock.calls.length > 0 ||
      factTreeDeps.teamToplist.resolveTimesSentOff.mock.calls.length > 0;
    expect(anyViolenceCalled).toBe(true);
  });

  it('includes the injuries-suffered facts in the era-scoped random pool', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    // Sweep [0,1) in fine steps so every era-supporting leaf index is hit;
    // at least one injuries-suffered query must be reachable.
    const sampleCount = 60;
    for (let i = 0; i < sampleCount; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / sampleCount);
      await service.execute(chatInput(null, { era: '20' }));
      vi.restoreAllMocks();
      eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    }
    const anySufferedCalled =
      factTreeDeps.playerToplist.resolveCasualtiesSuffered.mock.calls.length >
        0 ||
      factTreeDeps.playerToplist.resolveSeriousInjuriesSuffered.mock.calls
        .length > 0 ||
      factTreeDeps.playerToplist.resolveLastingInjuriesSuffered.mock.calls
        .length > 0 ||
      factTreeDeps.teamToplist.resolveCasualtiesSuffered.mock.calls.length >
        0 ||
      factTreeDeps.teamToplist.resolveSeriousInjuriesSuffered.mock.calls
        .length > 0 ||
      factTreeDeps.teamToplist.resolveLastingInjuriesSuffered.mock.calls
        .length > 0 ||
      factTreeDeps.teamToplist.resolveDeathsSuffered.mock.calls.length > 0;
    expect(anySufferedCalled).toBe(true);
  });
});
