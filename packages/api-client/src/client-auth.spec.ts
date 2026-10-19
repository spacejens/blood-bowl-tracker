import { describe, expect, it, vi } from 'vitest';

vi.mock('@orpc/client/fetch', () => ({
  RPCLink: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

import { RPCLink } from '@orpc/client/fetch';

import type { ApiClientFetch } from './client';
import { createApiClient } from './client';

describe('createApiClient authentication', () => {
  const getLinkOptions = (): {
    url: string;
    headers: () => Record<string, string>;
    fetch: unknown;
  } =>
    vi.mocked(RPCLink).mock.calls.at(-1)?.[0] as unknown as {
      url: string;
      headers: () => Record<string, string>;
      fetch: unknown;
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
