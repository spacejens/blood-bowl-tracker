import { describe, expect, it, vi } from 'vitest';

vi.mock('@orpc/client/fetch', () => ({
  RPCLink: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

import { RPCLink } from '@orpc/client/fetch';

import { createApiClient } from './client';
import { resilientFetch } from './resilient-fetch';

describe('createApiClient authentication', () => {
  const getLinkOptions = (): {
    url: string;
    headers: () => Record<string, string>;
    fetch: unknown;
  } =>
    vi.mocked(RPCLink).mock.calls[0][0] as unknown as {
      url: string;
      headers: () => Record<string, string>;
      fetch: unknown;
    };

  it('points the link at the /rpc endpoint of the base URL', () => {
    createApiClient('http://localhost:3000', 'a-token');
    expect(getLinkOptions().url).toBe('http://localhost:3000/rpc');
  });

  it('sends the api token as a bearer Authorization header', () => {
    createApiClient('http://localhost:3000', 'a-token');
    expect(getLinkOptions().headers()).toEqual({
      Authorization: 'Bearer a-token',
    });
  });

  // Long imports must survive a mid-run production redeploy: every RPC call
  // goes through the wrapper that bounds each attempt with a timeout and
  // retries transport failures, instead of the bare global fetch.
  it('sends every request through the resilient fetch wrapper', () => {
    createApiClient('http://localhost:3000', 'a-token');
    expect(getLinkOptions().fetch).toBe(resilientFetch);
  });
});
