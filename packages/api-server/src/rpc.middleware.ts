import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  MatchEventsService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type { NestMiddleware } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { isDefinedError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';

import { buildRpcRouter } from './rpc-router';

const RPC_PREFIX = '/rpc';

@Injectable()
export class RpcMiddleware implements NestMiddleware {
  private readonly handler: RPCHandler<Record<never, never>>;

  private readonly logger = new Logger(RpcMiddleware.name);

  constructor(
    coachesService: CoachesService,
    externalSystemsService: ExternalSystemsService,
    leaguesService: LeaguesService,
    racesService: RacesService,
    rulesSetsService: RulesSetsService,
    erasService: ErasService,
    positionsService: PositionsService,
    teamsService: TeamsService,
    competitionsService: CompetitionsService,
    matchesService: MatchesService,
    playersService: PlayersService,
    matchEventsService: MatchEventsService,
  ) {
    this.handler = new RPCHandler(
      buildRpcRouter(
        coachesService,
        externalSystemsService,
        leaguesService,
        racesService,
        rulesSetsService,
        erasService,
        positionsService,
        teamsService,
        competitionsService,
        matchesService,
        playersService,
        matchEventsService,
      ),
      {
        interceptors: [
          async ({ next, request }) => {
            try {
              return await next();
            } catch (err) {
              const location = `${request.method} ${request.url.pathname}`;
              if (isDefinedError(err)) {
                // Defined errors (e.g. CONFLICT) are expected business
                // outcomes, not bugs — warn with the message, no stack.
                this.logger.warn(
                  `Defined error handling RPC request ${location}: ${(err as Error).message}`,
                );
              } else {
                this.logger.error(
                  `Unhandled error handling RPC request ${location}`,
                  err instanceof Error ? err.stack : String(err),
                );
              }
              throw err;
            }
          },
        ],
      },
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
