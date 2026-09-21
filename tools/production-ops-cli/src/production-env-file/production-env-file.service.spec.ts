import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ProductionEnvFileService } from './production-env-file.service';

describe('ProductionEnvFileService', () => {
  let service: ProductionEnvFileService;
  let gitRoots: MockProxy<GitRootsService>;
  let worktreeRoot: string;
  let envPath: string;

  beforeEach(async () => {
    worktreeRoot = mkdtempSync(join(tmpdir(), 'production-env-file-'));
    envPath = join(worktreeRoot, 'apps/discord-bot/.env.production');

    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot: worktreeRoot,
      worktreeRoot,
      isWorktree: false,
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
    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, contents, 'utf8');
  }

  it('reads and returns a variable value', async () => {
    writeEnvFile(
      'DATABASE_URL=postgres://u:p@h/d\nDISCORD_BOT_TOKEN=abc.def.ghi\n',
    );

    await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
      'abc.def.ghi',
    );
  });

  it('strips a matched double-quote pair', async () => {
    writeEnvFile('DISCORD_BOT_TOKEN="abc.def.ghi"\n');

    await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
      'abc.def.ghi',
    );
  });

  it('strips a matched single-quote pair', async () => {
    writeEnvFile("DISCORD_BOT_TOKEN='abc.def.ghi'\n");

    await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
      'abc.def.ghi',
    );
  });

  it('leaves an unquoted value unchanged', async () => {
    writeEnvFile('DISCORD_BOT_TOKEN=abc.def.ghi\n');

    await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
      'abc.def.ghi',
    );
  });

  it('does not strip an unbalanced quote, returning the value as-is', async () => {
    writeEnvFile('DISCORD_BOT_TOKEN="abc.def.ghi\n');

    await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
      '"abc.def.ghi',
    );
  });

  it('strips a trailing CRLF', async () => {
    writeEnvFile('DISCORD_BOT_TOKEN=abc.def.ghi\r\n');

    await expect(service.readValue('DISCORD_BOT_TOKEN')).resolves.toBe(
      'abc.def.ghi',
    );
  });

  it('throws naming the file when .env.production does not exist', async () => {
    await expect(service.readValue('DISCORD_BOT_TOKEN')).rejects.toThrow(
      /apps\/discord-bot\/\.env\.production/,
    );
  });

  it('throws naming the variable when it is not set', async () => {
    writeEnvFile('OTHER_VAR=1\n');

    await expect(service.readValue('DISCORD_BOT_TOKEN')).rejects.toThrow(
      /does not set DISCORD_BOT_TOKEN/,
    );
  });
});
