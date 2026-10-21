import { DynamicModule, FactoryProvider, Global, Module } from '@nestjs/common';

import {
  ADMIN_COMMAND_ROLE_ID,
  DEBUG_COMMAND_ROLE_ID,
  DISCORD_BOT_TOKEN,
  DiscordClientService,
} from './discord-client.service';
import { HandledInteractionBuilderService } from './handled-interaction-builder.service';
import { MemberRoleAccessService } from './member-role-access.service';

export interface DiscordClientModuleOptions {
  token: string;
  /** Omitted means `debug`-restricted commands are not role-gated. */
  debugRoleId?: string;
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
  useDebugRoleIdFactory?: FactoryProvider<string | undefined>['useFactory'];
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
      providers: [
        { provide: DISCORD_BOT_TOKEN, useValue: options.token },
        {
          provide: DEBUG_COMMAND_ROLE_ID,
          useValue: options.debugRoleId,
        },
        { provide: ADMIN_COMMAND_ROLE_ID, useValue: options.adminRoleId },
        MemberRoleAccessService,
        HandledInteractionBuilderService,
        DiscordClientService,
      ],
      exports: [
        DiscordClientService,
        MemberRoleAccessService,
        DEBUG_COMMAND_ROLE_ID,
        ADMIN_COMMAND_ROLE_ID,
      ],
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
        {
          provide: DEBUG_COMMAND_ROLE_ID,
          useFactory: options.useDebugRoleIdFactory ?? (() => undefined),
          inject: options.useDebugRoleIdFactory ? (options.inject ?? []) : [],
        },
        {
          provide: ADMIN_COMMAND_ROLE_ID,
          useFactory: options.useAdminRoleIdFactory ?? (() => undefined),
          inject: options.useAdminRoleIdFactory ? (options.inject ?? []) : [],
        },
        MemberRoleAccessService,
        HandledInteractionBuilderService,
        DiscordClientService,
      ],
      exports: [
        DiscordClientService,
        MemberRoleAccessService,
        DEBUG_COMMAND_ROLE_ID,
        ADMIN_COMMAND_ROLE_ID,
      ],
    };
  }
}
