import { Module } from '@nestjs/common';

import { CliSharedModule } from './cli-shared.module';
import { DiscordBotTokenService } from './discord-bot-token.service';
import { DiscordRestService } from './discord-rest.service';

/**
 * Discord's REST API for the CLIs that call it. Kept out of
 * `CliSharedModule`, like `ChildProcessModule`, so only those CLIs resolve it.
 */
@Module({
  imports: [CliSharedModule],
  providers: [DiscordBotTokenService, DiscordRestService],
  exports: [DiscordRestService],
})
export class DiscordRestModule {}
