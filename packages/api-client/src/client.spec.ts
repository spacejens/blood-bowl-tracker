import { describe, it, expect } from 'vitest';
import { createApiClient } from './client';

describe('createApiClient', () => {
  it('creates a client with teams, matches, and matchEvents', () => {
    const client = createApiClient('http://localhost:3000');
    expect(client.teams).toBeDefined();
    expect(client.matches).toBeDefined();
    expect(client.matchEvents).toBeDefined();
  });

  it('teams client has list, getById, and create methods', () => {
    const client = createApiClient('http://localhost:3000');
    expect(typeof client.teams.list).toBe('function');
    expect(typeof client.teams.getById).toBe('function');
    expect(typeof client.teams.create).toBe('function');
  });
});
