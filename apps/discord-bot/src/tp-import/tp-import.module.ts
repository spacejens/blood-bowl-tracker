import { ImportTpLiveModule } from '@blood-bowl-tracker/import-tp-live';
import { Module } from '@nestjs/common';

import { ErrorListFitService } from './error-list-fit.service';
import { TpImportDispatchService } from './tp-import-dispatch.service';
import { TpImportFailureService } from './tp-import-failure.service';

/**
 * TP importing shared by every part of the bot that learns of a TP page:
 * the `/importtp` slash command and the TP notification feed. Both import a
 * page through the same dispatch, so they import it the same way, judge
 * the outcome through the same `TpImportFailureService`, so both agree on
 * what a failure is, and fit long error lists to Discord's limits through
 * the same `ErrorListFitService`, so both say how many errors were left out
 * the same way.
 *
 * `ImportTpLiveModule` needs `TP_CONNECTION_PROVIDER` and packages/db's
 * `DB`, both supplied by `@Global()` modules `AppModule` registers
 * (`TpConnectionModule`, `DbModule`); `DiscordBotConfigService` is global
 * too.
 */
@Module({
  imports: [ImportTpLiveModule],
  providers: [
    TpImportDispatchService,
    TpImportFailureService,
    ErrorListFitService,
  ],
  exports: [
    TpImportDispatchService,
    TpImportFailureService,
    ErrorListFitService,
  ],
})
export class TpImportModule {}
