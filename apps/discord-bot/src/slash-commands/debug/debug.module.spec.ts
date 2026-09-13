import { DB, DbModule } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { DiscordClientModule } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DebugModule } from './debug.module';
import { DebugFilterUsageCommandService } from './debug-filter-usage-command.service';
import { DebugInteractionsCommandService } from './debug-interactions-command.service';
import { DebugRetriggerHandlerService } from './debug-retrigger-handler.service';
import { DebugTopUsersCommandService } from './debug-top-users-command.service';

/**
 * Compiles the real `DebugModule` against a real `DiscordClientModule` (per
 * CLAUDE.md's module-composition exception) to verify the whole dependency
 * graph actually wires together - not just that each service's own spec can
 * satisfy its constructor with hand-picked mocks. This is the test that would
 * have caught `MemberRoleAccessService` and `RESTRICTED_COMMAND_ROLE_ID` being
 * declared as `DiscordClientModule` providers but never exported: without the
 * export, `DebugRetriggerHandlerService` (which injects both, from outside
 * that module) could not be resolved, and Nest would throw at bootstrap.
 *
 * `DbModule` is imported (rather than the whole `AppModule`) with its real
 * `DB` provider overridden by a mock chain - the only unavoidable mock here,
 * since a real Postgres connection has no place in a unit test. Everything
 * else - `DiscordClientModule`, `DebugModule`, and the game-data modules it
 * transitively imports - is composed for real.
 */
describe('DebugModule', () => {
  it('resolves the debug commands and the retrigger handler with their dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DbModule.forRootAsync({ useFactory: () => 'unused' }),
        DiscordClientModule.forRoot({
          token: 'test-token',
          restrictedRoleId: 'role-1',
        }),
        DebugModule,
      ],
    })
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(DebugRetriggerHandlerService)).toBeInstanceOf(
      DebugRetriggerHandlerService,
    );
    expect(moduleRef.get(DebugInteractionsCommandService)).toBeInstanceOf(
      DebugInteractionsCommandService,
    );
    expect(moduleRef.get(DebugTopUsersCommandService)).toBeInstanceOf(
      DebugTopUsersCommandService,
    );
    expect(moduleRef.get(DebugFilterUsageCommandService)).toBeInstanceOf(
      DebugFilterUsageCommandService,
    );
  });
});
