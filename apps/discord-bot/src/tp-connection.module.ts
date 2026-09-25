import type { TpConnectionProvider } from '@blood-bowl-tracker/import-tp-live';
import { TP_CONNECTION_PROVIDER } from '@blood-bowl-tracker/import-tp-live';
import { Global, Module } from '@nestjs/common';

import { DiscordBotConfigService } from './discord-bot-config.service';

/**
 * Supplies packages/import-tp-live's `TP_CONNECTION_PROVIDER` — TP's base
 * URLs — from the bot's config. `@Global()` because that package's modules
 * inject the token without importing an app-specific module. Both URLs are
 * read when the provider is built, so a missing one fails startup.
 */
@Global()
@Module({
  providers: [
    {
      provide: TP_CONNECTION_PROVIDER,
      useFactory: (config: DiscordBotConfigService): TpConnectionProvider => {
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
