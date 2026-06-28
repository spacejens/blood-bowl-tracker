import { describe, it, expect } from 'vitest';
import { contract } from './contract';

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
});
