import { DB, DbModule } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { DiscordClientModule } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { UsageRecordingModule } from './usage-recording.module';
import { UsageRecordingService } from './usage-recording.service';

/**
 * Compiles the real `UsageRecordingModule` — and through it the real
 * `DiscordBotUsageModule` — against a real `DiscordClientModule` (per
 * CLAUDE.md's module-composition exception), to verify the recording
 * wiring resolves. Only the database is mocked.
 */
describe('UsageRecordingModule', () => {
  it('resolves the usage recording service with its dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DbModule.forRootAsync({ useFactory: () => 'unused' }),
        DiscordClientModule.forRoot({ token: 'test-token' }),
        UsageRecordingModule,
      ],
    })
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(UsageRecordingService)).toBeInstanceOf(
      UsageRecordingService,
    );
  });
});
