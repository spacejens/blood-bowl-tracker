import {
  ChildProcessService,
  GitRootsService,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { DiscordBotTokenService } from './discord-bot-token/discord-bot-token.service';
import { FetchDiscordMessageService } from './fetch-discord-message/fetch-discord-message.service';
import { FetchRecentDiscordMessagesService } from './fetch-recent-discord-messages/fetch-recent-discord-messages.service';
import { ProductionEnvFileService } from './production-env-file/production-env-file.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { ResetProductionSchemaService } from './reset-production-schema/reset-production-schema.service';
import { RunProductionQueryService } from './run-production-query/run-production-query.service';

describe('AppModule', () => {
  it('wires every production-ops subcommand service with its dependencies resolved', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(ProcessRunnerService)).toBeInstanceOf(
      ProcessRunnerService,
    );
    expect(moduleRef.get(GitRootsService)).toBeInstanceOf(GitRootsService);
    expect(moduleRef.get(ChildProcessService)).toBeInstanceOf(
      ChildProcessService,
    );
    expect(moduleRef.get(ProductionEnvFileService)).toBeInstanceOf(
      ProductionEnvFileService,
    );
    expect(moduleRef.get(DiscordBotTokenService)).toBeInstanceOf(
      DiscordBotTokenService,
    );
    expect(moduleRef.get(FetchRecentDiscordMessagesService)).toBeInstanceOf(
      FetchRecentDiscordMessagesService,
    );
    expect(moduleRef.get(FetchDiscordMessageService)).toBeInstanceOf(
      FetchDiscordMessageService,
    );
    expect(moduleRef.get(CheckProductionConfigPortService)).toBeInstanceOf(
      CheckProductionConfigPortService,
    );
    expect(moduleRef.get(ProductionTunnelService)).toBeInstanceOf(
      ProductionTunnelService,
    );
    expect(moduleRef.get(RunProductionQueryService)).toBeInstanceOf(
      RunProductionQueryService,
    );
    expect(moduleRef.get(ResetProductionSchemaService)).toBeInstanceOf(
      ResetProductionSchemaService,
    );
  });
});
