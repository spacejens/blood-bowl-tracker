import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { createApiClient } from './client';
import type { ApiClient } from './client';
import { ApiClientModule, API_CLIENT } from './api-client.module';
import { ApiClientConfigService } from './api-client-config.service';

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
