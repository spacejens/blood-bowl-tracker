import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { API_CLIENT, ApiClientModule } from './api-client.module';
import { ApiClientConfigService } from './api-client-config.service';
import type { ApiClient } from './client';
import { createApiClient } from './client';

describe('createApiClient', () => {
  it('creates a client with coaches and externalSystems', () => {
    const client = createApiClient('http://localhost:3000');
    expect(client.coaches).toBeDefined();
    expect(client.externalSystems).toBeDefined();
  });

  it('coaches client has an upsert method', () => {
    const client = createApiClient('http://localhost:3000');
    expect(typeof client.coaches.upsert).toBe('function');
  });

  it('externalSystems client has an upsert method', () => {
    const client = createApiClient('http://localhost:3000');
    expect(typeof client.externalSystems.upsert).toBe('function');
  });

  it('creates a client exposing races', () => {
    const client = createApiClient('http://localhost:3000');
    expect(client.races).toBeDefined();
  });

  it('races client has an upsert method', () => {
    const client = createApiClient('http://localhost:3000');
    expect(typeof client.races.upsert).toBe('function');
  });

  it('creates a client exposing competitions', () => {
    const client = createApiClient('http://localhost:3000');
    expect(client.competitions).toBeDefined();
  });

  it('competitions client has an upsert method', () => {
    const client = createApiClient('http://localhost:3000');
    expect(typeof client.competitions.upsert).toBe('function');
  });

  it('creates a client exposing matches', () => {
    const client = createApiClient('http://localhost:3000');
    expect(client.matches).toBeDefined();
  });

  it('matches client has an upsert method', () => {
    const client = createApiClient('http://localhost:3000');
    expect(typeof client.matches.upsert).toBe('function');
  });

  it('creates a client exposing teams', () => {
    const client = createApiClient('http://localhost:3000');
    expect(client.teams).toBeDefined();
  });

  it('teams client has an upsert method', () => {
    const client = createApiClient('http://localhost:3000');
    expect(typeof client.teams.upsert).toBe('function');
  });

  it('creates a client exposing matchEvents', () => {
    const client = createApiClient('http://localhost:3000');
    expect(client.matchEvents).toBeDefined();
  });

  it('matchEvents client has an upsert method', () => {
    const client = createApiClient('http://localhost:3000');
    expect(typeof client.matchEvents.upsert).toBe('function');
  });

  // Regression: the raw oRPC client Proxy turns ANY property access into a
  // callable procedure. As a NestJS provider that made it look thenable (Nest
  // awaited it, firing a bogus `then` RPC) and exposed lifecycle-hook names as
  // procedures (`POST /rpc/onModuleInit`), aborting startup against a real
  // server. The client must expose only the real contract routers.
  it.each([
    'then',
    'onModuleInit',
    'onModuleDestroy',
    'onApplicationBootstrap',
    'onApplicationShutdown',
    'beforeApplicationShutdown',
  ])('does not expose the incidental property %s', (prop) => {
    const client = createApiClient(
      'http://localhost:3000',
    ) as unknown as Record<string, unknown>;
    expect(client[prop]).toBeUndefined();
  });

  it('is not thenable (safe to use as an awaited provider value)', () => {
    const client = createApiClient('http://localhost:3000') as unknown as {
      then?: unknown;
    };
    expect(typeof client.then).not.toBe('function');
  });

  it('exposes only the contract routers', () => {
    const client = createApiClient('http://localhost:3000');
    expect(Object.keys(client).sort()).toEqual([
      'coaches',
      'competitions',
      'eras',
      'externalSystems',
      'leagues',
      'matchEvents',
      'matches',
      'players',
      'positions',
      'races',
      'rulesSets',
      'teams',
    ]);
  });
});

describe('ApiClientModule', () => {
  it('provides an API client via forRoot', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiClientModule.forRoot({ baseUrl: 'http://localhost:3000' })],
    }).compile();

    const client = moduleRef.get<ApiClient>(API_CLIENT);
    expect(client.coaches).toBeDefined();
  });

  it('provides an API client via forRootAsync using ApiClientConfigService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiClientModule.forRootAsync({
          useFactory: (config: ApiClientConfigService) =>
            config.getApiBaseUrl(),
          inject: [ApiClientConfigService],
        }),
      ],
    }).compile();

    const client = moduleRef.get<ApiClient>(API_CLIENT);
    expect(client.coaches).toBeDefined();
  });
});
