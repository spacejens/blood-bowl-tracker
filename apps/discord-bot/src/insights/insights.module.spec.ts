import { DB, DbModule } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DiscordBotConfigModule } from '../discord-bot-config.module';
import { FACT_TREE } from './fact-tree.token';
import { CoachToplistService } from './facts/coach-toplist.service';
import { StatsSummaryFactsService } from './facts/stats-summary.service';
import { TrophiesListService } from './facts/trophies-list.service';
import { InsightsModule } from './insights.module';
import { LeaderboardService } from './leaderboard.service';
import { PlayerContextService } from './player-context.service';

/**
 * Compiles the real `InsightsModule` with its real providers (per CLAUDE.md's
 * module-composition exception) to verify the whole dependency graph wires
 * together. `InsightsModule` imports modules from both `game-data` and
 * `game-data-queries`, and the queries services inject `game-data` services
 * from outside their own package, so a missing or unexported module import
 * would only otherwise surface when the bot starts.
 *
 * `DbModule` is imported with its real `DB` provider overridden by a mock
 * chain - the only unavoidable mock, since a real Postgres connection has no
 * place in a unit test.
 */
describe('InsightsModule', () => {
  it('resolves the insight services and the fact tree with their dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DbModule.forRootAsync({ useFactory: () => 'unused' }),
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DiscordBotConfigModule,
        InsightsModule,
      ],
    })
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(LeaderboardService)).toBeInstanceOf(
      LeaderboardService,
    );
    expect(moduleRef.get(CoachToplistService)).toBeInstanceOf(
      CoachToplistService,
    );
    expect(moduleRef.get(StatsSummaryFactsService)).toBeInstanceOf(
      StatsSummaryFactsService,
    );
    expect(moduleRef.get(TrophiesListService)).toBeInstanceOf(
      TrophiesListService,
    );
    expect(moduleRef.get(PlayerContextService)).toBeInstanceOf(
      PlayerContextService,
    );
    expect(moduleRef.get(FACT_TREE)).toBeDefined();
  });
});
