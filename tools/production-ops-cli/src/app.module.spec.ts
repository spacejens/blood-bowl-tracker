import {
  ChildProcessService,
  DatabaseUrlRedactorService,
  DiscordRestService,
  GitRootsService,
  PgClientService,
  ProcessRunnerService,
  ProductionEnvFileService,
  RunProductionQueryService,
} from '@blood-bowl-tracker/cli-shared';
import { Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { FetchDiscordMessageService } from './fetch-discord-message/fetch-discord-message.service';
import { FetchRecentDiscordMessagesService } from './fetch-recent-discord-messages/fetch-recent-discord-messages.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';

/** Every service the subcommands reach, local and imported. */
const SERVICES: readonly Type<unknown>[] = [
  ProcessRunnerService,
  GitRootsService,
  ChildProcessService,
  ProductionEnvFileService,
  DatabaseUrlRedactorService,
  PgClientService,
  RunProductionQueryService,
  DiscordRestService,
  FetchRecentDiscordMessagesService,
  FetchDiscordMessageService,
  CheckProductionConfigPortService,
  ProductionTunnelService,
];

describe('AppModule', () => {
  it('wires every production-ops subcommand service with its dependencies resolved', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    for (const service of SERVICES) {
      expect(moduleRef.get(service)).toBeInstanceOf(service);
    }
  });
});
