import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MIGRATIONS_DIR,
  LocalMigrationsService,
  MIGRATIONS_DIR,
} from './local-migrations.service';

describe('LocalMigrationsService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'local-migrations-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeService(
    migrationsDir: string,
  ): Promise<LocalMigrationsService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LocalMigrationsService,
        { provide: MIGRATIONS_DIR, useValue: migrationsDir },
      ],
    }).compile();
    return moduleRef.get(LocalMigrationsService);
  }

  function givenMigration(name: string): void {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'migration.sql'), 'SELECT 1;');
  }

  it('lists migration folders sorted by name, ignoring folders without migration.sql', async () => {
    givenMigration('20260702000000_b');
    givenMigration('20260701000000_a');
    mkdirSync(join(dir, 'not-a-migration'));

    const service = await makeService(dir);

    expect(service.list()).toEqual(['20260701000000_a', '20260702000000_b']);
  });

  it('fails when the folder holds no migrations', async () => {
    const service = await makeService(dir);

    expect(() => service.list()).toThrow(`No migrations found in ${dir}`);
  });

  it('fails when the folder does not exist', async () => {
    const missing = join(dir, 'missing');
    const service = await makeService(missing);

    expect(() => service.list()).toThrow(
      `Migrations folder not found: ${missing}`,
    );
  });

  it('defaults to packages/db/migrations in this checkout', () => {
    expect(
      existsSync(join(DEFAULT_MIGRATIONS_DIR, '..', 'drizzle.config.ts')),
    ).toBe(true);
  });
});
