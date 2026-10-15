import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  ENV_PRODUCTION_PATH,
  ProductionDatabaseUrlService,
} from './production-database-url.service';

const URL_VALUE =
  'postgresql://owner:hunter2@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require';

describe('ProductionDatabaseUrlService', () => {
  let service: ProductionDatabaseUrlService;
  let gitRoots: MockProxy<GitRootsService>;
  let root: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'backup-cli-production-url-'));
    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot: join(root, 'elsewhere'),
      worktreeRoot: root,
      isWorktree: true,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductionDatabaseUrlService,
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(ProductionDatabaseUrlService);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeEnv(contents: string): void {
    mkdirSync(join(root, 'apps', 'discord-bot'), { recursive: true });
    writeFileSync(join(root, ENV_PRODUCTION_PATH), contents);
  }

  async function failure(): Promise<Error> {
    return service.read().then(
      () => {
        throw new Error('expected read() to fail');
      },
      (e: unknown) => e as Error,
    );
  }

  it('reads DATABASE_URL from the env file of the checkout it runs in', async () => {
    writeEnv(`OTHER=1\nDATABASE_URL=${URL_VALUE}\nMORE=2\n`);

    await expect(service.read()).resolves.toBe(URL_VALUE);
  });

  it('strips a trailing CR and a surrounding double-quote pair', async () => {
    writeEnv(`DATABASE_URL="${URL_VALUE}"\r\nOTHER=1\r\n`);

    await expect(service.read()).resolves.toBe(URL_VALUE);
  });

  it('strips a surrounding single-quote pair', async () => {
    writeEnv(`DATABASE_URL='${URL_VALUE}'\n`);

    await expect(service.read()).resolves.toBe(URL_VALUE);
  });

  it('accepts the postgres:// scheme too', async () => {
    writeEnv('DATABASE_URL=postgres://u:p@h/db\n');

    await expect(service.read()).resolves.toBe('postgres://u:p@h/db');
  });

  it('refuses when the env file is missing, naming the file', async () => {
    const error = await failure();

    expect(error.message).toContain(`${ENV_PRODUCTION_PATH} not found`);
  });

  it('refuses when the env file does not set DATABASE_URL', async () => {
    writeEnv('OTHER=1\n');

    const error = await failure();

    expect(error.message).toBe(
      `${ENV_PRODUCTION_PATH} does not set DATABASE_URL.`,
    );
  });

  it('refuses a value that is not a postgres URL without echoing it', async () => {
    writeEnv('DATABASE_URL=mysql://owner:hunter2@host/db\n');

    const error = await failure();

    expect(error.message).toContain('not a postgres:// or postgresql://');
    expect(error.message).not.toContain('hunter2');
  });

  it('refuses an empty value', async () => {
    writeEnv('DATABASE_URL=\n');

    await expect(failure()).resolves.toHaveProperty(
      'message',
      expect.stringContaining('empty or not a postgres://'),
    );
  });

  it('leaves an unbalanced quote in place, so the value is refused', async () => {
    writeEnv(`DATABASE_URL="${URL_VALUE}\n`);

    const error = await failure();

    expect(error.message).toContain('empty or not a postgres://');
    expect(error.message).not.toContain('hunter2');
  });
});
