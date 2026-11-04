import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiClientFetch } from './client';
import { createApiClient } from './client';

interface LinkOptions {
  url: string;
  headers: () => Record<string, string>;
  fetch: unknown;
}

type RpcLinkMock = Mock<(options: LinkOptions) => object>;

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
  // createApiClient calls `new RPCLink(options)`: a plain function (not an
  // arrow) that returns an object can be called with `new`.
  RPCLink: function RPCLink(options: LinkOptions): object {
    return link.get()(options);
  },
}));

describe('createApiClient authentication', () => {
  let rpcLink: RpcLinkMock;

  beforeEach(() => {
    rpcLink = vi.fn<(options: LinkOptions) => object>(() => ({}));
    link.state.current = rpcLink;
  });

  afterEach(() => {
    link.state.current = undefined;
  });

  const getLinkOptions = (): LinkOptions => {
    expect(rpcLink).toHaveBeenCalledTimes(1);
    return rpcLink.mock.calls[0][0];
  };

  const stubFetch: ApiClientFetch = () => Promise.resolve(new Response('{}'));

  it('points the link at the /rpc endpoint of the base URL', () => {
    createApiClient('http://localhost:3000', 'a-token', stubFetch);
    expect(getLinkOptions().url).toBe('http://localhost:3000/rpc');
  });

  it('sends the api token as a bearer Authorization header', () => {
    createApiClient('http://localhost:3000', 'a-token', stubFetch);
    expect(getLinkOptions().headers()).toEqual({
      Authorization: 'Bearer a-token',
    });
  });

  // Long imports must survive a mid-run production redeploy: every RPC call
  // goes through the fetch function the caller supplies (ApiClientModule
  // supplies ResilientFetchService's), instead of the bare global fetch.
  it('sends every request through the fetch function it is given', () => {
    const fetchImpl: ApiClientFetch = () => Promise.resolve(new Response('{}'));
    createApiClient('http://localhost:3000', 'a-token', fetchImpl);
    expect(getLinkOptions().fetch).toBe(fetchImpl);
  });
});
