import { describe, it, expect } from 'vitest';
import type { AnyContractProcedure } from '@orpc/contract';
import { contract } from './contract';
import { CreateEraSchema } from './schemas/era';

// oRPC contract procedures don't expose `.method`/`.path` directly the way
// ts-rest routes did; route metadata lives on the internal `~orpc.route`
// definition, so introspect it directly here.
function routeOf(procedure: AnyContractProcedure) {
  return procedure['~orpc'].route;
}

describe('contract', () => {
  it('defines teams routes', () => {
    expect(routeOf(contract.teams.list)).toMatchObject({
      method: 'GET',
      path: '/teams',
    });
    expect(routeOf(contract.teams.getById)).toMatchObject({
      method: 'GET',
      path: '/teams/{id}',
    });
    expect(routeOf(contract.teams.create)).toMatchObject({
      method: 'POST',
      path: '/teams',
    });
  });

  it('defines matches routes', () => {
    expect(routeOf(contract.matches.list)).toMatchObject({
      method: 'GET',
    });
    expect(routeOf(contract.matches.getById)).toMatchObject({
      method: 'GET',
    });
    expect(routeOf(contract.matches.create)).toMatchObject({
      method: 'POST',
    });
  });

  it('defines matchEvents routes', () => {
    expect(routeOf(contract.matchEvents.listByMatch)).toMatchObject({
      method: 'GET',
    });
    expect(routeOf(contract.matchEvents.create)).toMatchObject({
      method: 'POST',
    });
  });

  it('defines externalSystems routes', () => {
    expect(routeOf(contract.externalSystems.list)).toMatchObject({
      method: 'GET',
      path: '/external-systems',
    });
    expect(routeOf(contract.externalSystems.getById)).toMatchObject({
      method: 'GET',
      path: '/external-systems/{id}',
    });
    expect(routeOf(contract.externalSystems.create)).toMatchObject({
      method: 'POST',
      path: '/external-systems',
    });
    expect(routeOf(contract.externalSystems.upsert)).toMatchObject({
      method: 'POST',
      path: '/external-systems/upsert',
    });
  });

  it('defines coaches routes', () => {
    expect(routeOf(contract.coaches.list)).toMatchObject({
      method: 'GET',
      path: '/coaches',
    });
    expect(routeOf(contract.coaches.getById)).toMatchObject({
      method: 'GET',
      path: '/coaches/{id}',
    });
    expect(routeOf(contract.coaches.create)).toMatchObject({
      method: 'POST',
      path: '/coaches',
    });
    expect(routeOf(contract.coaches.upsert)).toMatchObject({
      method: 'POST',
      path: '/coaches/upsert',
    });
  });

  it('defines teamEras routes', () => {
    expect(routeOf(contract.teamEras.list)).toMatchObject({
      method: 'GET',
      path: '/team-eras',
    });
    expect(routeOf(contract.teamEras.getById)).toMatchObject({
      method: 'GET',
      path: '/team-eras/{id}',
    });
    expect(routeOf(contract.teamEras.create)).toMatchObject({
      method: 'POST',
      path: '/team-eras',
    });
  });

  it('requires externalSystemId when creating an era', () => {
    const result = CreateEraSchema.safeParse({
      name: 'Spring 2026',
      leagueId: 1,
      rulesSetId: 1,
      startDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });
});
