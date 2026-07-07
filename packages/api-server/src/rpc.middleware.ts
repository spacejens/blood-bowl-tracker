import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import { RPCHandler } from '@orpc/server/node';
import {
  CoachesService,
  ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';
import { buildRpcRouter } from './rpc-router';
import type { IncomingMessage, ServerResponse } from 'node:http';

const RPC_PREFIX = '/rpc';

@Injectable()
export class RpcMiddleware implements NestMiddleware {
  private readonly handler: RPCHandler<Record<never, never>>;

  constructor(
    coachesService: CoachesService,
    externalSystemsService: ExternalSystemsService,
  ) {
    this.handler = new RPCHandler(
      buildRpcRouter(coachesService, externalSystemsService),
    );
  }

  async use(
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ): Promise<void> {
    // NestJS registers this middleware via `forRoutes('*splat')`, which Express
    // implements as a path-mounted `app.use('*splat', ...)`. Express rewrites
    // `req.url` to be relative to the matched mount segment for path-mounted
    // middleware, and since the wildcard consumes the entire path, `req.url`
    // becomes `/` here regardless of the real request path. The original path
    // survives on `req.originalUrl` (this `req` is actually an Express
    // `Request` at runtime even though it's typed as Node's `IncomingMessage`).
    // oRPC's own Node adapter already falls back the same way internally
    // (`req.originalUrl ?? req.url`), so mirror that here for the prefix check.
    const url =
      (req as IncomingMessage & { originalUrl?: string }).originalUrl ??
      req.url;
    if (!url?.startsWith(RPC_PREFIX)) {
      next();
      return;
    }
    const { matched } = await this.handler.handle(req, res, {
      prefix: RPC_PREFIX,
      context: {},
    });
    if (!matched) next();
  }
}
