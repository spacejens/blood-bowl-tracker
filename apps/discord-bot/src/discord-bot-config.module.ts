import { Global, Module } from '@nestjs/common';

import { DiscordBotConfigService } from './discord-bot-config.service';

@Global()
@Module({
  providers: [DiscordBotConfigService],
  exports: [DiscordBotConfigService],
})
export class DiscordBotConfigModule {}
