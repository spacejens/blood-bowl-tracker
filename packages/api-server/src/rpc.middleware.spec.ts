import type { IncomingMessage, ServerResponse } from 'node:http';

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isDefinedError, ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

let handleMock = vi.hoisted(() => vi.fn());

vi.mock('@orpc/server/node', () => ({
  RPCHandler: vi.fn().mockImplementation(function () {
    return { handle: handleMock };
  }),
}));

import { RPCHandler } from '@orpc/server/node';

import { ApiTokenAuthService } from './api-token-auth.service';
import { RpcMiddleware } from './rpc.middleware';
import { RPC_ROUTER } from './rpc-router.token';
import type { RpcRouterFactoryService } from './rpc-router-factory.service';

describe('RpcMiddleware', () => {
  let middleware: RpcMiddleware;
  let auth: MockProxy<ApiTokenAuthService>;
  // Initialized here only so TypeScript infers the callable mock type;
  // reassigned fresh per test in beforeEach.
  let next = vi.fn();

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

  beforeEach(async () => {
    vi.clearAllMocks();
    handleMock = vi.fn();
    next = vi.fn();
    auth = mock<ApiTokenAuthService>();
    auth.authenticate.mockReturnValue({
      authenticated: true,
      callerName: 'import-bbl',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        RpcMiddleware,
        { provide: ApiTokenAuthService, useValue: auth },
        {
          provide: RPC_ROUTER,
          useValue: {} as ReturnType<RpcRouterFactoryService['build']>,
        },
      ],
    }).compile();
    middleware = moduleRef.get(RpcMiddleware);
  });

  it('delegates /rpc requests to the oRPC handler and does not call next() when matched', async () => {
    handleMock.mockResolvedValue({ matched: true });
    const req = {
      method: 'POST',
      url: '/rpc/coaches/upsert',
      headers: { authorization: 'Bearer bbl-secret' },
    } as unknown as IncomingMessage;
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
    const req = {
      method: 'POST',
      url: '/rpc/unknown',
      headers: { authorization: 'Bearer bbl-secret' },
    } as unknown as IncomingMessage;
    const res = {} as ServerResponse;

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() immediately without invoking the handler for non-/rpc requests', async () => {
    const req = {
      method: 'GET',
      url: '/',
      headers: { authorization: 'Bearer bbl-secret' },
    } as unknown as IncomingMessage;
    const res = {} as ServerResponse;

    await middleware.use(req, res, next);

    expect(handleMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to req.originalUrl for the /rpc prefix check, since Express rewrites req.url to "/" for path-mounted wildcard middleware', async () => {
    handleMock.mockResolvedValue({ matched: true });
    const req = {
      method: 'POST',
      url: '/',
      originalUrl: '/rpc/coaches/upsert',
      headers: { authorization: 'Bearer bbl-secret' },
    } as unknown as IncomingMessage & { originalUrl: string };
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

  it('passes the Authorization header to ApiTokenAuthService and invokes the handler when it authenticates', async () => {
    handleMock.mockResolvedValue({ matched: true });
    const req = {
      method: 'POST',
      url: '/rpc/coaches/upsert',
      headers: { authorization: 'Bearer bbl-secret' },
    } as unknown as IncomingMessage;
    const res = {} as ServerResponse;

    await middleware.use(req, res, next);

    expect(auth.authenticate).toHaveBeenCalledWith('Bearer bbl-secret');
    expect(handleMock).toHaveBeenCalledTimes(1);
  });

  it('responds 401 and never invokes the oRPC handler when authentication fails', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    auth.authenticate.mockReturnValue({ authenticated: false });
    const req = {
      method: 'POST',
      url: '/rpc/coaches/upsert',
      headers: {},
    } as unknown as IncomingMessage;
    const res = {
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await middleware.use(req, res, next);

    expect(handleMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/json',
    );
    expect(res.end).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Unauthorized' }),
    );
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain('POST');
    expect(message).toContain('/rpc/coaches/upsert');
  });

  it('does not authenticate non-/rpc requests', async () => {
    const req = {
      method: 'GET',
      url: '/',
      headers: {},
    } as unknown as IncomingMessage;
    const res = {} as ServerResponse;

    await middleware.use(req, res, next);

    expect(auth.authenticate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
