import { describe, it, expect } from 'vitest';
import { contract } from './contract';
import { CreateEraSchema } from './schemas/era';

describe('contract', () => {
  it('defines teams routes', () => {
    expect(contract.teams.list.method).toBe('GET');
    expect(contract.teams.list.path).toBe('/teams');
    expect(contract.teams.getById.method).toBe('GET');
    expect(contract.teams.getById.path).toBe('/teams/:id');
    expect(contract.teams.create.method).toBe('POST');
    expect(contract.teams.create.path).toBe('/teams');
  });

  it('defines matches routes', () => {
    expect(contract.matches.list.method).toBe('GET');
    expect(contract.matches.getById.method).toBe('GET');
    expect(contract.matches.create.method).toBe('POST');
  });

  it('defines matchEvents routes', () => {
    expect(contract.matchEvents.listByMatch.method).toBe('GET');
    expect(contract.matchEvents.create.method).toBe('POST');
  });

  it('defines externalSystems routes', () => {
    expect(contract.externalSystems.list.method).toBe('GET');
    expect(contract.externalSystems.list.path).toBe('/external-systems');
    expect(contract.externalSystems.getById.method).toBe('GET');
    expect(contract.externalSystems.getById.path).toBe('/external-systems/:id');
    expect(contract.externalSystems.create.method).toBe('POST');
    expect(contract.externalSystems.create.path).toBe('/external-systems');
    expect(contract.externalSystems.upsert.method).toBe('POST');
    expect(contract.externalSystems.upsert.path).toBe(
      '/external-systems/upsert',
    );
  });

  it('defines coaches routes', () => {
    expect(contract.coaches.list.method).toBe('GET');
    expect(contract.coaches.list.path).toBe('/coaches');
    expect(contract.coaches.getById.method).toBe('GET');
    expect(contract.coaches.getById.path).toBe('/coaches/:id');
    expect(contract.coaches.create.method).toBe('POST');
    expect(contract.coaches.create.path).toBe('/coaches');
    expect(contract.coaches.upsert.method).toBe('POST');
    expect(contract.coaches.upsert.path).toBe('/coaches/upsert');
  });

  it('defines teamEras routes', () => {
    expect(contract.teamEras.list.method).toBe('GET');
    expect(contract.teamEras.list.path).toBe('/team-eras');
    expect(contract.teamEras.getById.method).toBe('GET');
    expect(contract.teamEras.getById.path).toBe('/team-eras/:id');
    expect(contract.teamEras.create.method).toBe('POST');
    expect(contract.teamEras.create.path).toBe('/team-eras');
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
