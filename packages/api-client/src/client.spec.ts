import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { API_CLIENT, ApiClientModule } from './api-client.module';
import { ApiClientConfigService } from './api-client-config.service';
import type { ApiClient, ApiClientFetch } from './client';
import { createApiClient } from './client';

describe('createApiClient', () => {
  const stubFetch: ApiClientFetch = () => Promise.resolve(new Response('{}'));

  it('creates a client with coaches and externalSystems', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(client.coaches).toBeDefined();
    expect(client.externalSystems).toBeDefined();
  });

  it('coaches client has an upsert method', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(typeof client.coaches.upsert).toBe('function');
  });

  it('externalSystems client has an upsert method', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(typeof client.externalSystems.upsert).toBe('function');
  });

  it('creates a client exposing races', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(client.races).toBeDefined();
  });

  it('races client has an upsert method', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(typeof client.races.upsert).toBe('function');
  });

  it('creates a client exposing competitions', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(client.competitions).toBeDefined();
  });

  it('competitions client has an upsert method', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(typeof client.competitions.upsert).toBe('function');
  });

  it('creates a client exposing matches', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(client.matches).toBeDefined();
  });

  it('matches client has an upsert method', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(typeof client.matches.upsert).toBe('function');
  });

  it('creates a client exposing teams', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(client.teams).toBeDefined();
  });

  it('teams client has an upsert method', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(typeof client.teams.upsert).toBe('function');
  });

  it('creates a client exposing matchEvents', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(client.matchEvents).toBeDefined();
  });

  it('matchEvents client has an upsert method', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(typeof client.matchEvents.upsert).toBe('function');
  });

  // The raw oRPC client Proxy turns ANY property access into a callable
  // procedure. As a NestJS provider it would look thenable (Nest awaits it,
  // firing a bogus `then` RPC) and expose lifecycle-hook names as procedures
  // (`POST /rpc/onModuleInit`), aborting startup against a real server. The
  // client must expose only the real contract routers.
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
      'a-token',
      stubFetch,
    ) as unknown as Record<string, unknown>;
    expect(client[prop]).toBeUndefined();
  });

  it('is not thenable (safe to use as an awaited provider value)', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    ) as unknown as {
      then?: unknown;
    };
    expect(typeof client.then).not.toBe('function');
  });

  it('exposes only the contract routers', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(Object.keys(client).sort()).toEqual([
      'advancementCosts',
      'coaches',
      'competitionGroups',
      'competitions',
      'eras',
      'externalSystems',
      'keywords',
      'leagues',
      'manualImportBatches',
      'matchEvents',
      'matches',
      'playerSkills',
      'players',
      'positionRulesSetKeywords',
      'positionRulesSetSkills',
      'positionRulesSets',
      'positions',
      'races',
      'rulesSets',
      'skillRulesSets',
      'skills',
      'sppAwardValues',
      'teams',
      'tpCompetitions',
      'tpMatches',
      'tpOfficialTeams',
      'tpRosters',
      'trophies',
      'trophyAwards',
    ]);
  });

  it('matchEvents client has an upsertBatch method', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(typeof client.matchEvents.upsertBatch).toBe('function');
  });

  it('externalSystems client has an upsertBatch method', () => {
    const client = createApiClient(
      'http://localhost:3000',
      'a-token',
      stubFetch,
    );
    expect(typeof client.externalSystems.upsertBatch).toBe('function');
  });
});

describe('ApiClientModule', () => {
  it('provides an API client via forRoot', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiClientModule.forRoot({
          baseUrl: 'http://localhost:3000',
          apiToken: 'a-token',
        }),
      ],
    }).compile();

    const client = moduleRef.get<ApiClient>(API_CLIENT);
    expect(client.coaches).toBeDefined();
  });

  it('provides an API client via forRootAsync using ApiClientConfigService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiClientModule.forRootAsync({
          useFactory: (config: ApiClientConfigService) => ({
            baseUrl: config.getApiBaseUrl(),
            apiToken: 'a-token',
          }),
          inject: [ApiClientConfigService],
        }),
      ],
    }).compile();

    const client = moduleRef.get<ApiClient>(API_CLIENT);
    expect(client.coaches).toBeDefined();
  });
});
