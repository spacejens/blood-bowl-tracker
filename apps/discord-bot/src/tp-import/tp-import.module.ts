import { ImportTpLiveModule } from '@blood-bowl-tracker/import-tp-live';
import { Module } from '@nestjs/common';

import { TpImportDispatchService } from './tp-import-dispatch.service';

/**
 * TP importing shared by every part of the bot that learns of a TP page:
 * the `/importtp` slash command and the TP notification feed. Both import a
 * page through the same dispatch, so they import it the same way.
 *
 * `ImportTpLiveModule` needs `TP_CONNECTION_PROVIDER` and packages/db's
 * `DB`, both supplied by `@Global()` modules `AppModule` registers
 * (`TpConnectionModule`, `DbModule`); `DiscordBotConfigService` is global
 * too.
 */
@Module({
  imports: [ImportTpLiveModule],
  providers: [TpImportDispatchService],
  exports: [TpImportDispatchService],
})
export class TpImportModule {}
