import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@orpc/client/fetch', () => ({
  RPCLink: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

import { RPCLink } from '@orpc/client/fetch';

import { ApiClientModule } from './api-client.module';
import { ApiClientConfigService } from './api-client-config.service';
import type { ApiClientFetch } from './client';
import { ResilientFetchService } from './resilient-fetch.service';

// Composition spec: compiles the real module on purpose (see CLAUDE.md,
// "Module composition is one deliberate exception") to verify the API_CLIENT
// factory is wired to the module's own ResilientFetchService. RPCLink is
// mocked only to capture the fetch function the factory hands it.
const lastLinkFetch = (): ApiClientFetch =>
  (
    vi.mocked(RPCLink).mock.calls.at(-1)?.[0] as unknown as {
      fetch: ApiClientFetch;
    }
  ).fetch;

const expectFetchRoutedThroughService = async (
  service: ResilientFetchService,
): Promise<void> => {
  const response = new Response('{}');
  const fetchSpy = vi.spyOn(service, 'fetch').mockResolvedValue(response);
  const request = new Request('http://localhost:3000/rpc');

  await expect(lastLinkFetch()(request, { redirect: 'manual' })).resolves.toBe(
    response,
  );
  expect(fetchSpy).toHaveBeenCalledWith(request, { redirect: 'manual' });
};

describe('ApiClientModule fetch wiring', () => {
  it('routes forRoot client requests through ResilientFetchService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiClientModule.forRoot({
          baseUrl: 'http://localhost:3000',
          apiToken: 'a-token',
        }),
      ],
    }).compile();

    await expectFetchRoutedThroughService(moduleRef.get(ResilientFetchService));
  });

  it('routes forRootAsync client requests through ResilientFetchService', async () => {
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

    await expectFetchRoutedThroughService(moduleRef.get(ResilientFetchService));
  });
});
