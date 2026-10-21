import { DiscordBotUsageModule } from '@blood-bowl-tracker/discord-bot-usage';
import { Module } from '@nestjs/common';

import { UsageRecordingService } from './usage-recording.service';

/**
 * Connects usage recording to the Discord client. `DiscordBotUsageModule`
 * supplies `UsageTrackingService`; `DiscordClientService` comes from the
 * `@Global()` `DiscordClientModule` that `AppModule` registers.
 */
@Module({
  imports: [DiscordBotUsageModule],
  providers: [UsageRecordingService],
})
export class UsageRecordingModule {}
