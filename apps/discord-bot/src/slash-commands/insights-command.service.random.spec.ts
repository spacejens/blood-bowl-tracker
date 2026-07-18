import { afterEach, describe, expect, it, vi } from 'vitest';

import { INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE } from '../error-messages';
import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — random pick', () => {
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
    expect(teamsCalled || matchesCalled).toBe(true);
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
});
