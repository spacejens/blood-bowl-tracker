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
    if (!req.url?.startsWith(RPC_PREFIX)) {
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
