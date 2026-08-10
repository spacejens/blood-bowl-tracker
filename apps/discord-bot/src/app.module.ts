import { ApiServerModule } from '@blood-bowl-tracker/api-server';
import { DbModule } from '@blood-bowl-tracker/db';
import { DiscordClientModule } from '@blood-bowl-tracker/discord-client';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import postgres from 'postgres';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DeploymentInfoService } from './deployment-info.service';
import { DiscordBotConfigModule } from './discord-bot-config.module';
import { DiscordBotConfigService } from './discord-bot-config.service';
import { InsightsModule } from './insights/insights.module';
import { RandomInsightsSchedulerService } from './insights/random-insights-scheduler.service';
import {
  AdvisoryLockService,
  LOCK_SQL,
} from './leader-election/advisory-lock.service';
import { ProcessExitService } from './leader-election/process-exit.service';
import { SleepService } from './leader-election/sleep.service';
import { SlashCommandsModule } from './slash-commands/slash-commands.module';
import { StartupNotifierService } from './startup-notifier.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DiscordBotConfigModule,
    DbModule.forRootAsync({
      useFactory: (config: DiscordBotConfigService) => config.getDatabaseUrl(),
      inject: [DiscordBotConfigService],
    }),
    ApiServerModule,
    DiscordClientModule.forRootAsync({
      useFactory: (config: DiscordBotConfigService) =>
        config.getDiscordBotToken(),
      inject: [DiscordBotConfigService],
    }),
    InsightsModule,
    SlashCommandsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DeploymentInfoService,
    StartupNotifierService,
    RandomInsightsSchedulerService,
    {
      // Its own postgres.js client, deliberately separate from drizzle's
      // pooled one: advisory locks are session-scoped (see
      // AdvisoryLockService). `max: 1` because exactly one reserved
      // connection is ever needed.
      provide: LOCK_SQL,
      useFactory: (config: DiscordBotConfigService) =>
        postgres(config.getDatabaseUrl(), { max: 1 }),
      inject: [DiscordBotConfigService],
    },
    AdvisoryLockService,
    ProcessExitService,
    SleepService,
  ],
})
export class AppModule {}
