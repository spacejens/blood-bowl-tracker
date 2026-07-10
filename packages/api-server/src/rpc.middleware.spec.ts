import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  CoachesService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  RacesService,
  RulesSetsService,
} from '@blood-bowl-tracker/game-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleMock = vi.fn();

vi.mock('@orpc/server/node', () => ({
  RPCHandler: vi.fn().mockImplementation(function () {
    return { handle: handleMock };
  }),
}));

vi.mock('./rpc-router', () => ({
  buildRpcRouter: vi.fn().mockReturnValue({}),
}));

import { RpcMiddleware } from './rpc.middleware';

describe('RpcMiddleware', () => {
  let middleware: RpcMiddleware;
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    middleware = new RpcMiddleware(
      {} as CoachesService,
      {} as ExternalSystemsService,
      {} as LeaguesService,
      {} as RacesService,
      {} as RulesSetsService,
      {} as ErasService,
    );
  });

  it('delegates /rpc requests to the oRPC handler and does not call next() when matched', async () => {
    handleMock.mockResolvedValue({ matched: true });
    const req = { url: '/rpc/coaches/upsert' } as IncomingMessage;
    const res = {} as ServerResponse;

    await middleware.use(req, res, next);

    expect(handleMock).toHaveBeenCalledWith(req, res, {
      prefix: '/rpc',
      context: {},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the oRPC handler reports no match', async () => {
    handleMock.mockResolvedValue({ matched: false });
    const req = { url: '/rpc/unknown' } as IncomingMessage;
    const res = {} as ServerResponse;

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() immediately without invoking the handler for non-/rpc requests', async () => {
    const req = { url: '/' } as IncomingMessage;
    const res = {} as ServerResponse;

    await middleware.use(req, res, next);

    expect(handleMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to req.originalUrl for the /rpc prefix check, since Express rewrites req.url to "/" for path-mounted wildcard middleware', async () => {
    handleMock.mockResolvedValue({ matched: true });
    const req = {
      url: '/',
      originalUrl: '/rpc/coaches/upsert',
    } as IncomingMessage & { originalUrl: string };
    const res = {} as ServerResponse;

    await middleware.use(req, res, next);

    expect(handleMock).toHaveBeenCalledWith(req, res, {
      prefix: '/rpc',
      context: {},
    });
    expect(next).not.toHaveBeenCalled();
  });
});
