import { DynamicModule, FactoryProvider, Global, Module } from '@nestjs/common';
import {
  DISCORD_BOT_TOKEN,
  DiscordClientService,
} from './discord-client.service';

export interface DiscordClientModuleOptions {
  token: string;
}

export interface DiscordClientModuleAsyncOptions {
  useFactory: FactoryProvider<string>['useFactory'];
  inject?: FactoryProvider<string>['inject'];
}

@Global()
@Module({})
export class DiscordClientModule {
  static forRoot(options: DiscordClientModuleOptions): DynamicModule {
    return {
      module: DiscordClientModule,
      providers: [
        { provide: DISCORD_BOT_TOKEN, useValue: options.token },
        DiscordClientService,
      ],
      exports: [DiscordClientService],
    };
  }

  static forRootAsync(options: DiscordClientModuleAsyncOptions): DynamicModule {
    return {
      module: DiscordClientModule,
      providers: [
        {
          provide: DISCORD_BOT_TOKEN,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        DiscordClientService,
      ],
      exports: [DiscordClientService],
    };
  }
}
