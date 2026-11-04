import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RpcLinkMock = Mock<(options: { fetch: unknown }) => object>;

// RPCLink is replaced by a wrapper delegating to the current test's mock,
// installed fresh in beforeEach, so each test sees only its own calls.
const link = vi.hoisted(() => {
  const state: { current?: RpcLinkMock } = {};
  return {
    state,
    get: (): RpcLinkMock => {
      if (!state.current) {
        throw new Error('RPCLink mock was not installed for this test');
      }
      return state.current;
    },
  };
});

vi.mock('@orpc/client/fetch', () => ({
  // The factory calls `new RPCLink(options)`: a plain function (not an arrow)
  // that returns an object can be called with `new`.
  RPCLink: function RPCLink(options: { fetch: unknown }): object {
    return link.get()(options);
  },
}));

import { ApiClientModule } from './api-client.module';
import { ApiClientConfigService } from './api-client-config.service';
import type { ApiClientFetch } from './client';
import { ResilientFetchService } from './resilient-fetch.service';

// Composition spec: compiles the real module on purpose (see CLAUDE.md,
// "Module composition is one deliberate exception") to verify the API_CLIENT
// factory is wired to the module's own ResilientFetchService. RPCLink is
// mocked only to capture the fetch function the factory hands it.
const linkFetch = (rpcLink: RpcLinkMock): ApiClientFetch => {
  expect(rpcLink).toHaveBeenCalledTimes(1);
  return rpcLink.mock.calls[0][0].fetch as ApiClientFetch;
};

const expectFetchRoutedThroughService = async (
  service: ResilientFetchService,
  rpcLink: RpcLinkMock,
): Promise<void> => {
  const response = new Response('{}');
  const fetchSpy = vi.spyOn(service, 'fetch').mockResolvedValue(response);
  const request = new Request('http://localhost:3000/rpc');

  await expect(
    linkFetch(rpcLink)(request, { redirect: 'manual' }),
  ).resolves.toBe(response);
  expect(fetchSpy).toHaveBeenCalledWith(request, { redirect: 'manual' });
};

describe('ApiClientModule fetch wiring', () => {
  let rpcLink: RpcLinkMock;

  beforeEach(() => {
    rpcLink = vi.fn<(options: { fetch: unknown }) => object>(() => ({}));
    link.state.current = rpcLink;
  });

  afterEach(() => {
    link.state.current = undefined;
    // Only undoes the spy on the real ResilientFetchService instance.
    vi.restoreAllMocks();
  });

  it('routes forRoot client requests through ResilientFetchService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiClientModule.forRoot({
          baseUrl: 'http://localhost:3000',
          apiToken: 'a-token',
        }),
      ],
    }).compile();

    await expectFetchRoutedThroughService(
      moduleRef.get(ResilientFetchService),
      rpcLink,
    );
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

    await expectFetchRoutedThroughService(
      moduleRef.get(ResilientFetchService),
      rpcLink,
    );
  });
});
