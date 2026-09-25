import { DiscordBotUsageModule } from '@blood-bowl-tracker/discord-bot-usage';
import { DynamicModule, FactoryProvider, Global, Module } from '@nestjs/common';

import {
  ADMIN_COMMAND_ROLE_ID,
  DISCORD_BOT_TOKEN,
  DiscordClientService,
  RESTRICTED_COMMAND_ROLE_ID,
} from './discord-client.service';
import { MemberRoleAccessService } from './member-role-access.service';

export interface DiscordClientModuleOptions {
  token: string;
  /** Omitted means `debug`-restricted commands are not role-gated. */
  restrictedRoleId?: string;
  /** Omitted means `admin`-restricted commands are not role-gated. */
  adminRoleId?: string;
}

export interface DiscordClientModuleAsyncOptions {
  useFactory: FactoryProvider<string>['useFactory'];
  inject?: FactoryProvider<string>['inject'];
  /**
   * Resolves the role id `debug`-restricted commands require, sharing
   * `inject` with `useFactory`. Omitted means those commands are not
   * role-gated, so a consumer that does not care need not supply anything.
   */
  useRestrictedRoleIdFactory?: FactoryProvider<
    string | undefined
  >['useFactory'];
  /**
   * Resolves the role id `admin`-restricted commands require, sharing
   * `inject` with `useFactory`. Omitted means those commands are not
   * role-gated.
   */
  useAdminRoleIdFactory?: FactoryProvider<string | undefined>['useFactory'];
}

@Global()
@Module({})
export class DiscordClientModule {
  static forRoot(options: DiscordClientModuleOptions): DynamicModule {
    return {
      module: DiscordClientModule,
      imports: [DiscordBotUsageModule],
      providers: [
        { provide: DISCORD_BOT_TOKEN, useValue: options.token },
        {
          provide: RESTRICTED_COMMAND_ROLE_ID,
          useValue: options.restrictedRoleId,
        },
        { provide: ADMIN_COMMAND_ROLE_ID, useValue: options.adminRoleId },
        MemberRoleAccessService,
        DiscordClientService,
      ],
      exports: [
        DiscordClientService,
        MemberRoleAccessService,
        RESTRICTED_COMMAND_ROLE_ID,
        ADMIN_COMMAND_ROLE_ID,
      ],
    };
  }

  static forRootAsync(options: DiscordClientModuleAsyncOptions): DynamicModule {
    return {
      module: DiscordClientModule,
      imports: [DiscordBotUsageModule],
      providers: [
        {
          provide: DISCORD_BOT_TOKEN,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: RESTRICTED_COMMAND_ROLE_ID,
          useFactory: options.useRestrictedRoleIdFactory ?? (() => undefined),
          inject: options.useRestrictedRoleIdFactory
            ? (options.inject ?? [])
            : [],
        },
        {
          provide: ADMIN_COMMAND_ROLE_ID,
          useFactory: options.useAdminRoleIdFactory ?? (() => undefined),
          inject: options.useAdminRoleIdFactory ? (options.inject ?? []) : [],
        },
        MemberRoleAccessService,
        DiscordClientService,
      ],
      exports: [
        DiscordClientService,
        MemberRoleAccessService,
        RESTRICTED_COMMAND_ROLE_ID,
        ADMIN_COMMAND_ROLE_ID,
      ],
    };
  }
}
