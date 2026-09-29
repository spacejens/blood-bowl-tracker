import { TpPathsModule } from '@blood-bowl-tracker/tp-paths';
import { Module } from '@nestjs/common';

import { SleepService } from '../leader-election/sleep.service';
import { ClockService } from '../shared/clock.service';
import { TpImportModule } from '../tp-import/tp-import.module';
import { TpFeedBlockNoticeService } from './tp-feed-block-notice.service';
import { TpFeedFormatterService } from './tp-feed-formatter.service';
import { TpFeedImportService } from './tp-feed-import.service';
import { TpFeedListenerService } from './tp-feed-listener.service';
import { TpFeedParserService } from './tp-feed-parser.service';

/**
 * Detects, parses, echoes and imports TP (tourplay.net) notifications
 * posted into a configured Discord channel by TP's own integration.
 *
 * `TpImportModule` supplies the TP import dispatch and failure assessment
 * shared with `/importtp`; `TpPathsModule` the URL classifier.
 * `DiscordClientService` and `DiscordBotConfigService` come from `@Global()`
 * modules `AppModule` already registers. `SleepService` is dependency-free
 * and provided here for the import delay. `TpFeedBlockNoticeService` posts
 * the one-line TP block/resume notices; `ClockService` is dependency-free
 * and gives the import queue the time it needs to wait out a block.
 */
@Module({
  imports: [TpImportModule, TpPathsModule],
  providers: [
    TpFeedParserService,
    TpFeedFormatterService,
    TpFeedImportService,
    TpFeedListenerService,
    TpFeedBlockNoticeService,
    SleepService,
    ClockService,
  ],
})
export class TpFeedModule {}
