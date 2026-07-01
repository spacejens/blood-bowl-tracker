import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiServerModule } from '@blood-bowl-tracker/api-server';
import { DbModule } from '@blood-bowl-tracker/db';
import { DiscordClientModule } from '@blood-bowl-tracker/discord-client';
import { StartupNotifierService } from './startup-notifier.service';

@Module({
  imports: [
    DbModule.forRootAsync({
      useFactory: () => process.env.DATABASE_URL!,
    }),
    ApiServerModule,
    DiscordClientModule.forRootAsync({
      useFactory: () => process.env.DISCORD_BOT_TOKEN!,
    }),
  ],
  controllers: [AppController],
  providers: [AppService, StartupNotifierService],
})
export class AppModule {}
