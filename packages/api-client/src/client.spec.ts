import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { createApiClient } from './client';
import type { ApiClient } from './client';
import { ApiClientModule, API_CLIENT } from './api-client.module';

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

describe('ApiClientModule', () => {
  it('provides an API client via forRoot', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiClientModule.forRoot({ baseUrl: 'http://localhost:3000' })],
    }).compile();

    const client = moduleRef.get<ApiClient>(API_CLIENT);
    expect(client.teams).toBeDefined();
  });
});
