import { describe, expect, it, vi } from 'vitest';

vi.mock('@orpc/client/fetch', () => ({
  RPCLink: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

import { RPCLink } from '@orpc/client/fetch';

import { createApiClient } from './client';

describe('createApiClient authentication', () => {
  const getLinkOptions = (): {
    url: string;
    headers: () => Record<string, string>;
  } =>
    vi.mocked(RPCLink).mock.calls[0][0] as unknown as {
      url: string;
      headers: () => Record<string, string>;
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
});
