import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiServerModule } from '@blood-bowl-tracker/api-server';
import { DbModule } from '@blood-bowl-tracker/db';
import { DiscordClientModule } from '@blood-bowl-tracker/discord-client';
import { StartupNotifierService } from './startup-notifier.service';
import { InsightsModule } from './insights/insights.module';
import { SlashCommandsModule } from './slash-commands/slash-commands.module';
import { DiscordBotConfigModule } from './discord-bot-config.module';
import { DiscordBotConfigService } from './discord-bot-config.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  providers: [AppService, StartupNotifierService],
})
export class AppModule {}
