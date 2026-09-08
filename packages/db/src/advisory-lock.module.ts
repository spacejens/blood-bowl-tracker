import { DynamicModule, FactoryProvider, Module } from '@nestjs/common';

import { AdvisoryLockService, LOCK_SQL } from './advisory-lock.service';
import { createLockClient } from './lock-client';

export const LOCK_DATABASE_URL = Symbol('LOCK_DATABASE_URL');

export interface AdvisoryLockModuleAsyncOptions {
  useFactory: FactoryProvider<string>['useFactory'];
  inject?: FactoryProvider<string>['inject'];
}

/**
 * Provides the leader-election advisory lock and the dedicated postgres.js
 * client behind it. Lives here rather than in the consuming app for the same
 * reason the drizzle client does: `packages/db` is the only workspace allowed
 * to depend on the database driver, and this lock needs a session-scoped
 * connection that drizzle's pool cannot give it.
 *
 * Not `@Global()` (unlike `DbModule`): the lock has exactly one consumer, so
 * importing it explicitly keeps the dependency visible.
 */
@Module({})
export class AdvisoryLockModule {
  static forRootAsync(options: AdvisoryLockModuleAsyncOptions): DynamicModule {
    return {
      module: AdvisoryLockModule,
      providers: [
        {
          provide: LOCK_DATABASE_URL,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: LOCK_SQL,
          useFactory: (url: string) => createLockClient(url),
          inject: [LOCK_DATABASE_URL],
        },
        AdvisoryLockService,
      ],
      exports: [AdvisoryLockService],
    };
  }
}
