import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

/** DI token carrying the absolute path of the drizzle migrations folder. */
export const MIGRATIONS_DIR = Symbol('MIGRATIONS_DIR');

/**
 * `packages/db/migrations`, resolved from this file's own location (in
 * `tools/backup-cli/src/migrations/` or `tools/backup-cli/dist/migrations/`,
 * so four levels below the repo root either way) rather than the working
 * directory.
 */
export const DEFAULT_MIGRATIONS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'migrations',
);

/**
 * The migrations this checkout knows, as drizzle records them in
 * `drizzle.__drizzle_migrations.name`: one folder per migration, holding a
 * `migration.sql`, named so that sorting orders them by creation.
 */
@Injectable()
export class LocalMigrationsService {
  constructor(@Inject(MIGRATIONS_DIR) private readonly dir: string) {}

  list(): string[] {
    if (!existsSync(this.dir)) {
      throw new Error(`Migrations folder not found: ${this.dir}`);
    }
    const names = readdirSync(this.dir)
      .filter((name) => existsSync(join(this.dir, name, 'migration.sql')))
      .sort();
    if (names.length === 0) {
      throw new Error(`No migrations found in ${this.dir}`);
    }
    return names;
  }
}
