import {
  DEFAULT_LOCAL_DATABASE_URL,
  LocalDatabaseGuardService,
} from '@blood-bowl-tracker/cli-shared';
import { Inject, Injectable } from '@nestjs/common';

/** DI token carrying the environment `LOCAL_DATABASE_URL` is read from. */
export const LOCAL_DATABASE_ENV = Symbol('LOCAL_DATABASE_ENV');

export type LocalDatabaseEnv = Readonly<Record<string, string | undefined>>;

/**
 * The database generate-incomplete-player-fills reads: `LOCAL_DATABASE_URL`,
 * the variable backup-cli's `restore` also takes its target from, else the
 * docker-compose database `restore` writes to by default. backup-cli's config
 * file is not read, so the two tools stay independent. Any host but this
 * machine is refused before a connection is made.
 *
 * The URL it hands DbModule also sets `client_min_messages=warning`, which
 * postgres-js sends as a connection parameter. Applying migrations raises
 * NOTICEs (the migrator's `CREATE SCHEMA IF NOT EXISTS` does on every
 * migrated database), and postgres-js prints each one to stdout, where only
 * the CLI's JSON result belongs.
 */
@Injectable()
export class LocalDatabaseUrlService {
  constructor(
    @Inject(LOCAL_DATABASE_ENV) private readonly env: LocalDatabaseEnv,
    private readonly guard: LocalDatabaseGuardService,
  ) {}

  resolve(): string {
    const fromEnv = this.env.LOCAL_DATABASE_URL;
    const url =
      fromEnv === undefined || fromEnv === ''
        ? DEFAULT_LOCAL_DATABASE_URL
        : fromEnv;
    this.guard.assertLocal(url);
    const quiet = new URL(url);
    quiet.searchParams.set('client_min_messages', 'warning');
    return quiet.toString();
  }
}
