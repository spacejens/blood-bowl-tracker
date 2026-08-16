import { call } from '@orpc/server';
import { describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

const externalId = { externalSystemId: 1, externalId: 'id:47' };

describe('resolve procedures', () => {
  it('answers coaches.resolve from CoachesService', async () => {
    const { router, mocks } = await createRouterHarness();
    mocks.coachesService.resolve.mockResolvedValue({ found: true, id: 12 });

    await expect(call(router.coaches.resolve, externalId)).resolves.toEqual({
      found: true,
      id: 12,
    });
    expect(mocks.coachesService.resolve).toHaveBeenCalledWith(externalId);
  });

  it('passes a not-found answer straight through instead of throwing', async () => {
    const { router, mocks } = await createRouterHarness();
    mocks.racesService.resolve.mockResolvedValue({ found: false });

    await expect(call(router.races.resolve, externalId)).resolves.toEqual({
      found: false,
    });
  });

  it('answers races.resolveBatch index-aligned with the request', async () => {
    const { router, mocks } = await createRouterHarness();
    const input = [externalId, { externalSystemId: 1, externalId: 'id:48' }];
    mocks.racesService.resolveBatch.mockResolvedValue([
      { found: true, id: 3 },
      { found: false },
    ]);

    await expect(call(router.races.resolveBatch, input)).resolves.toEqual([
      { found: true, id: 3 },
      { found: false },
    ]);
    expect(mocks.racesService.resolveBatch).toHaveBeenCalledWith(input);
  });

  it('wires every resolvable namespace to its own service', async () => {
    const { router, mocks } = await createRouterHarness();
    const wiring = [
      [router.coaches, mocks.coachesService],
      [router.leagues, mocks.leaguesService],
      [router.rulesSets, mocks.rulesSetsService],
      [router.eras, mocks.erasService],
      [router.positions, mocks.positionsService],
      [router.teams, mocks.teamsService],
      [router.competitions, mocks.competitionsService],
      [router.competitionGroups, mocks.competitionGroupsService],
    ] as const;

    for (const [namespace, service] of wiring) {
      service.resolve.mockResolvedValue({ found: true, id: 1 });
      await expect(call(namespace.resolve, externalId)).resolves.toEqual({
        found: true,
        id: 1,
      });
      expect(service.resolve).toHaveBeenCalledWith(externalId);
    }
  });

  it('wires every resolvable namespace to its own service for resolveBatch', async () => {
    const { router, mocks } = await createRouterHarness();
    const input = [externalId, { externalSystemId: 1, externalId: 'id:48' }];
    const wiring = [
      [router.coaches, mocks.coachesService],
      [router.races, mocks.racesService],
      [router.leagues, mocks.leaguesService],
      [router.rulesSets, mocks.rulesSetsService],
      [router.eras, mocks.erasService],
      [router.positions, mocks.positionsService],
      [router.teams, mocks.teamsService],
      [router.competitions, mocks.competitionsService],
      [router.competitionGroups, mocks.competitionGroupsService],
    ] as const;

    for (const [namespace, service] of wiring) {
      service.resolveBatch.mockResolvedValue([{ found: true, id: 1 }]);
      await expect(call(namespace.resolveBatch, input)).resolves.toEqual([
        { found: true, id: 1 },
      ]);
      expect(service.resolveBatch).toHaveBeenCalledWith(input);
    }
  });
});
