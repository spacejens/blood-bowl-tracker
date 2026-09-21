import { Module } from '@nestjs/common';

import { TpFeedFormatterService } from './tp-feed-formatter.service';
import { TpFeedListenerService } from './tp-feed-listener.service';
import { TpFeedParserService } from './tp-feed-parser.service';

/**
 * Detects, parses and echoes TP (tourplay.net) notifications posted into a
 * configured Discord channel by TP's own integration.
 *
 * No `imports`: the two providers this module's listener injects from
 * elsewhere — `DiscordClientService` and `DiscordBotConfigService` — come
 * from `@Global()` modules `AppModule` already registers.
 */
@Module({
  providers: [
    TpFeedParserService,
    TpFeedFormatterService,
    TpFeedListenerService,
  ],
})
export class TpFeedModule {}
