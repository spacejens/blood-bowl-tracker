import { DB, DbModule } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { DiscordClientModule } from '@blood-bowl-tracker/discord-client';
import { TP_CONNECTION_PROVIDER } from '@blood-bowl-tracker/import-tp-live';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { TrophyDeepdiveService } from '../deepdive/facts/trophy-deepdive.service';
import { DiscordBotConfigModule } from '../discord-bot-config.module';
import { DeepdiveCommandService } from './deepdive-command.service';
import { InsightsCommandService } from './insights-command.service';
import { SlashCommandsModule } from './slash-commands.module';

// Stands in for the app's `TpConnectionModule`, whose factory reads the TP
// URLs from environment config that a unit test has no business setting.
@Global()
@Module({
  providers: [
    {
      provide: TP_CONNECTION_PROVIDER,
      useValue: {
        getBackendApiUrl: () => 'http://tp-backend.test',
        getFrontendBaseUrl: () => 'http://tp-frontend.test',
      },
    },
  ],
  exports: [TP_CONNECTION_PROVIDER],
})
class StubTpConnectionModule {}

/**
 * Compiles the real `SlashCommandsModule` with its real providers (per
 * CLAUDE.md's module-composition exception) to verify the deepdive and insight
 * commands' dependency graph wires together across `game-data` and
 * `game-data-queries`: the deepdive services inject queries services that in
 * turn inject `game-data` services, and a missing module import would
 * otherwise only surface when the bot starts.
 *
 * `DbModule` is imported with its real `DB` provider overridden by a mock
 * chain - the only unavoidable mock, since a real Postgres connection has no
 * place in a unit test.
 */
describe('SlashCommandsModule', () => {
  it('resolves the insight and deepdive commands with their dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DbModule.forRootAsync({ useFactory: () => 'unused' }),
        DiscordBotConfigModule,
        StubTpConnectionModule,
        DiscordClientModule.forRoot({
          token: 'test-token',
          debugRoleId: 'role-1',
        }),
        SlashCommandsModule,
      ],
    })
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(InsightsCommandService)).toBeInstanceOf(
      InsightsCommandService,
    );
    expect(moduleRef.get(DeepdiveCommandService)).toBeInstanceOf(
      DeepdiveCommandService,
    );
    expect(moduleRef.get(PlayerDeepdiveService)).toBeInstanceOf(
      PlayerDeepdiveService,
    );
    expect(moduleRef.get(TrophyDeepdiveService)).toBeInstanceOf(
      TrophyDeepdiveService,
    );
  });
});
