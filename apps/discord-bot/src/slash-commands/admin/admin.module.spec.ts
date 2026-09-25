import { DB, DbModule } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { DiscordClientModule } from '@blood-bowl-tracker/discord-client';
import type { TpConnectionProvider } from '@blood-bowl-tracker/import-tp-live';
import { TP_CONNECTION_PROVIDER } from '@blood-bowl-tracker/import-tp-live';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DiscordBotConfigModule } from '../../discord-bot-config.module';
import { TpConnectionModule } from '../../tp-connection.module';
import { AdminModule } from './admin.module';
import { ImportTpCommandService } from './import-tp-command.service';

/**
 * Compiles the real `AdminModule` — and through it the real
 * `ImportTpLiveModule` and `TpPathsModule` — together with the real
 * `TpConnectionModule` and config module (per CLAUDE.md's
 * module-composition exception), to verify the whole graph wires together:
 * in particular that `TP_CONNECTION_PROVIDER` reaches `ImportTpLiveModule`
 * from the app's `@Global()` module. Only the database is mocked.
 */
describe('AdminModule', () => {
  it('resolves /importtp with the TP connection wired from config', async () => {
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
            }),
          ],
        }),
        DiscordBotConfigModule,
        TpConnectionModule,
        DbModule.forRootAsync({ useFactory: () => 'unused' }),
        DiscordClientModule.forRoot({ token: 'test-token' }),
        AdminModule,
      ],
    })
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(ImportTpCommandService)).toBeInstanceOf(
      ImportTpCommandService,
    );
    const connection = moduleRef.get<TpConnectionProvider>(
      TP_CONNECTION_PROVIDER,
    );
    expect(connection.getFrontendUrl()).toBe('https://tp.example/blood-bowl/');
    expect(connection.getBackendApiUrl()).toBe('https://tp.example/api/');
  });
});
