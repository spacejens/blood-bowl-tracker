import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { GitRootsService } from './git-roots.service';
import { ENV_PRODUCTION_PATH } from './gitignored-files';
import { ProductionEnvFileService } from './production-env-file.service';

const URL_VALUE =
  'postgresql://owner:hunter2@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require';

describe('ProductionEnvFileService', () => {
  let service: ProductionEnvFileService;
  let gitRoots: MockProxy<GitRootsService>;
  let worktreeRoot: string;

  beforeEach(async () => {
    worktreeRoot = mkdtempSync(join(tmpdir(), 'cli-shared-production-env-'));
    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      // A different main root proves the file is read from the checkout
      // this process runs in, not from the main checkout.
      mainRoot: join(worktreeRoot, 'elsewhere'),
      worktreeRoot,
      isWorktree: true,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductionEnvFileService,
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(ProductionEnvFileService);
  });

  afterEach(() => {
    rmSync(worktreeRoot, { recursive: true, force: true });
  });

  function writeEnvFile(contents: string): void {
    const envPath = join(worktreeRoot, ENV_PRODUCTION_PATH);
    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, contents, 'utf8');
  }

  async function failure(read: Promise<string>): Promise<Error> {
    return read.then(
      () => {
        throw new Error('expected the read to fail');
      },
      (e: unknown) => e as Error,
    );
  }

  describe('readValue', () => {
    it('returns a plain value from the env file of the checkout it runs in', async () => {
      writeEnvFile('OTHER=1\nDISCORD_BOT_TOKEN=abc.def.ghi\nMORE=2\n');

      await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
        'abc.def.ghi',
      );
    });

    it('unquotes a double-quoted value', async () => {
      writeEnvFile('DISCORD_BOT_TOKEN="abc.def.ghi"\n');

      await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
        'abc.def.ghi',
      );
    });

    it('unquotes a single-quoted value', async () => {
      writeEnvFile("DISCORD_BOT_TOKEN='abc.def.ghi'\n");

      await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
        'abc.def.ghi',
      );
    });

    it('reads a file with CRLF line endings', async () => {
      writeEnvFile('DISCORD_BOT_TOKEN=abc.def.ghi\r\nOTHER=1\r\n');

      await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
        'abc.def.ghi',
      );
    });

    it('accepts an export prefix', async () => {
      writeEnvFile('export DISCORD_BOT_TOKEN=abc.def.ghi\n');

      await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
        'abc.def.ghi',
      );
    });

    it('accepts whitespace around the equals sign', async () => {
      writeEnvFile('DISCORD_BOT_TOKEN = abc.def.ghi\n');

      await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
        'abc.def.ghi',
      );
    });

    it('returns an empty value as an empty string', async () => {
      writeEnvFile('DISCORD_BOT_TOKEN=\n');

      await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe('');
    });

    it('refuses when the env file is missing, naming the file', async () => {
      const error = await failure(service.readValue('DISCORD_BOT_TOKEN'));

      expect(error.message).toBe(
        `${ENV_PRODUCTION_PATH} not found in this checkout. It is gitignored ` +
          'and lives in the main checkout: create it there (see ' +
          'docs/discord-bot/production-configuration.md) or, from a ' +
          'worktree, copy it in (see .claude/skills/deploy-production/SKILL.md).',
      );
    });

    it('refuses when the variable is not set, naming file and variable', async () => {
      writeEnvFile('OTHER=1\n');

      const error = await failure(service.readValue('DISCORD_BOT_TOKEN'));

      expect(error.message).toBe(
        `${ENV_PRODUCTION_PATH} does not set DISCORD_BOT_TOKEN.`,
      );
    });

    it('does not treat an inherited object property as a set variable', async () => {
      writeEnvFile('OTHER=1\n');

      const error = await failure(service.readValue('constructor'));

      expect(error.message).toBe(
        `${ENV_PRODUCTION_PATH} does not set constructor.`,
      );
    });
  });

  describe('readDatabaseUrl', () => {
    it('accepts a postgresql:// URL', async () => {
      writeEnvFile(`DATABASE_URL=${URL_VALUE}\n`);

      await expect(service.readDatabaseUrl()).resolves.toBe(URL_VALUE);
    });

    it('accepts a postgres:// URL', async () => {
      writeEnvFile('DATABASE_URL=postgres://u:p@h/db\n');

      await expect(service.readDatabaseUrl()).resolves.toBe(
        'postgres://u:p@h/db',
      );
    });

    it('accepts a quoted URL in a CRLF file', async () => {
      writeEnvFile(`DATABASE_URL="${URL_VALUE}"\r\n`);

      await expect(service.readDatabaseUrl()).resolves.toBe(URL_VALUE);
    });

    it('refuses an empty value', async () => {
      writeEnvFile('DATABASE_URL=\n');

      const error = await failure(service.readDatabaseUrl());

      expect(error.message).toBe(
        `DATABASE_URL in ${ENV_PRODUCTION_PATH} is empty or not a ` +
          'postgres:// or postgresql:// connection string; aborting without connecting.',
      );
    });

    it('refuses another scheme without echoing the value', async () => {
      writeEnvFile('DATABASE_URL=mysql://owner:hunter2@host/db\n');

      const error = await failure(service.readDatabaseUrl());

      expect(error.message).toContain('not a postgres:// or postgresql://');
      expect(error.message).not.toContain('hunter2');
    });

    it('refuses a value with an unbalanced quote without echoing it', async () => {
      writeEnvFile(`DATABASE_URL="${URL_VALUE}\n`);

      const error = await failure(service.readDatabaseUrl());

      expect(error.message).toContain('not a postgres:// or postgresql://');
      expect(error.message).not.toContain('hunter2');
    });

    it('propagates a missing DATABASE_URL', async () => {
      writeEnvFile('OTHER=1\n');

      const error = await failure(service.readDatabaseUrl());

      expect(error.message).toBe(
        `${ENV_PRODUCTION_PATH} does not set DATABASE_URL.`,
      );
    });
  });
});
