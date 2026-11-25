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
    return url;
  }
}
