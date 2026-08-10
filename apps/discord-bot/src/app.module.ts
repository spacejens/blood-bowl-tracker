import { ApiServerModule } from '@blood-bowl-tracker/api-server';
import { DbModule } from '@blood-bowl-tracker/db';
import { DiscordClientModule } from '@blood-bowl-tracker/discord-client';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DeploymentInfoService } from './deployment-info.service';
import { DiscordBotConfigModule } from './discord-bot-config.module';
import { DiscordBotConfigService } from './discord-bot-config.service';
import { InsightsModule } from './insights/insights.module';
import { RandomInsightsSchedulerService } from './insights/random-insights-scheduler.service';
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
  ],
})
export class AppModule {}
