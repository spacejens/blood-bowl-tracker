import type { IncomingMessage, ServerResponse } from 'node:http';

import { Logger } from '@nestjs/common';
import { isDefinedError, ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleMock = vi.fn();

vi.mock('@orpc/server/node', () => ({
  RPCHandler: vi.fn().mockImplementation(function () {
    return { handle: handleMock };
  }),
}));

import { RPCHandler } from '@orpc/server/node';

import { RpcMiddleware } from './rpc.middleware';
import type { buildRpcRouter } from './rpc-router';

describe('RpcMiddleware', () => {
  let middleware: RpcMiddleware;
  const next = vi.fn();

  type StandardHandleResult = { matched: boolean; response?: unknown };

  type RpcInterceptor = (options: {
    prefix: string;
    context: Record<never, never>;
    request: { method: string; url: URL };
    next: () => Promise<StandardHandleResult>;
  }) => Promise<StandardHandleResult>;

  // The interceptor is passed as the 2nd constructor arg to RPCHandler:
  //   new RPCHandler(router, { interceptors: [fn] })
  // RPCHandler is mocked, so its recorded call args expose the array.
  const getInterceptor = (): RpcInterceptor => {
    const options = vi.mocked(RPCHandler).mock.calls[0][1] as unknown as {
      interceptors: RpcInterceptor[];
    };
    return options.interceptors[0];
  };

  const makeRequest = (): { method: string; url: URL } => ({
    method: 'POST',
    url: new URL('http://localhost/rpc/coaches/upsert'),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    middleware = new RpcMiddleware({} as ReturnType<typeof buildRpcRouter>);
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

  it('logs unhandled errors at error level with method, path, and stack, then rethrows unchanged', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const boom = new Error('database exploded');
    next.mockRejectedValue(boom);

    const interceptor = getInterceptor();

    await expect(
      interceptor({
        prefix: '/rpc',
        context: {},
        request: makeRequest(),
        next,
      }),
    ).rejects.toBe(boom);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, stack] = errorSpy.mock.calls[0] as [string, string];
    expect(message).toContain('POST');
    expect(message).toContain('/rpc/coaches/upsert');
    expect(stack).toBe(boom.stack);
  });

  it('logs defined errors at warn level with method, path, and message (no stack), then rethrows unchanged', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const conflict = new ORPCError('CONFLICT', {
      defined: true,
      message: 'Coach already exists',
    });
    // Sanity-check the fixture actually reads as a defined error.
    expect(isDefinedError(conflict)).toBe(true);
    next.mockRejectedValue(conflict);

    const interceptor = getInterceptor();

    await expect(
      interceptor({
        prefix: '/rpc',
        context: {},
        request: makeRequest(),
        next,
      }),
    ).rejects.toBe(conflict);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain('POST');
    expect(message).toContain('/rpc/coaches/upsert');
    expect(message).toContain('Coach already exists');
  });

  it('passes the next() result through unchanged and logs nothing on success', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const result = { matched: true, response: { status: 200 } };
    next.mockResolvedValue(result);

    const interceptor = getInterceptor();

    await expect(
      interceptor({
        prefix: '/rpc',
        context: {},
        request: makeRequest(),
        next,
      }),
    ).resolves.toBe(result);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
