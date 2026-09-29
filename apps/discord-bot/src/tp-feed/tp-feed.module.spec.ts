import { DB, DbModule } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { DiscordClientModule } from '@blood-bowl-tracker/discord-client';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DiscordBotConfigModule } from '../discord-bot-config.module';
import { TpConnectionModule } from '../tp-connection.module';
import { TpFeedModule } from './tp-feed.module';
import { TpFeedImportService } from './tp-feed-import.service';
import { TpFeedListenerService } from './tp-feed-listener.service';

/**
 * Compiles the real `TpFeedModule` — and through it the real
 * `TpImportModule`, `ImportTpLiveModule` and `TpPathsModule` — with the
 * real `TpConnectionModule` and config module (per CLAUDE.md's
 * module-composition exception), to verify the feed's import wiring. Only
 * the database is mocked.
 */
describe('TpFeedModule', () => {
  it('resolves the listener and the import queue', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              TP_EXTERNAL_SYSTEM_NAME: 'TP',
              TP_FRONTEND_BASE_URL: 'https://tp.example/blood-bowl/',
              TP_BACKEND_API_URL: 'https://tp.example/api/',
              TP_SCRAPING_ENABLED: 'true',
            }),
          ],
        }),
        DiscordBotConfigModule,
        TpConnectionModule,
        DbModule.forRootAsync({ useFactory: () => 'unused' }),
        DiscordClientModule.forRoot({ token: 'test-token' }),
        TpFeedModule,
      ],
    })
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(TpFeedListenerService)).toBeInstanceOf(
      TpFeedListenerService,
    );
    expect(moduleRef.get(TpFeedImportService)).toBeInstanceOf(
      TpFeedImportService,
    );
  });
});
