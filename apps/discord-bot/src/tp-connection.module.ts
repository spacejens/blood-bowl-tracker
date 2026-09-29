import type { TpConnectionProvider } from '@blood-bowl-tracker/import-tp-live';
import { TP_CONNECTION_PROVIDER } from '@blood-bowl-tracker/import-tp-live';
import { Global, Module } from '@nestjs/common';

import { DiscordBotConfigService } from './discord-bot-config.service';

/**
 * Supplies packages/import-tp-live's `TP_CONNECTION_PROVIDER` — TP's base
 * URLs — from the bot's config. `@Global()` because that package's modules
 * inject the token without importing an app-specific module. Both URLs and
 * the `TP_SCRAPING_ENABLED` switch are read when the provider is built, so a
 * missing or invalid one fails startup. The URLs are required whether or not
 * scraping is enabled; the switch itself is acted on by the bot's TP import
 * callers (`/importtp` and the TP feed), not here.
 */
@Global()
@Module({
  providers: [
    {
      provide: TP_CONNECTION_PROVIDER,
      useFactory: (config: DiscordBotConfigService): TpConnectionProvider => {
        config.getTpScrapingEnabled();
        const backendApiUrl = config.getTpBackendApiUrl();
        const frontendUrl = config.getTpFrontendBaseUrl();
        return {
          getBackendApiUrl: () => backendApiUrl,
          getFrontendUrl: () => frontendUrl,
        };
      },
      inject: [DiscordBotConfigService],
    },
  ],
  exports: [TP_CONNECTION_PROVIDER],
})
export class TpConnectionModule {}
