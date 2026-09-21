import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DiscordBotTokenService } from './discord-bot-token.service';

describe('DiscordBotTokenService', () => {
  let service: DiscordBotTokenService;
  let gitRoots: MockProxy<GitRootsService>;
  let worktreeRoot: string;
  let envPath: string;

  beforeEach(async () => {
    worktreeRoot = mkdtempSync(join(tmpdir(), 'discord-bot-token-'));
    envPath = join(worktreeRoot, 'apps/discord-bot/.env.production');

    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot: worktreeRoot,
      worktreeRoot,
      isWorktree: false,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordBotTokenService,
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(DiscordBotTokenService);
  });

  afterEach(() => {
    rmSync(worktreeRoot, { recursive: true, force: true });
  });

  function writeEnvFile(contents: string): void {
    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, contents, 'utf8');
  }

  it('reads DISCORD_BOT_TOKEN from the production env file', async () => {
    writeEnvFile(
      'DATABASE_URL=postgres://u:p@h/d\nDISCORD_BOT_TOKEN=abc.def.ghi\n',
    );

    await expect(service.read()).resolves.toBe('abc.def.ghi');
  });

  it('strips a dotenv-style surrounding quote pair and trailing CRLF', async () => {
    writeEnvFile('DISCORD_BOT_TOKEN="abc.def.ghi"\r\n');

    await expect(service.read()).resolves.toBe('abc.def.ghi');
  });

  it('throws naming the file when .env.production does not exist', async () => {
    await expect(service.read()).rejects.toThrow(
      /apps\/discord-bot\/\.env\.production/,
    );
  });

  it('throws when DISCORD_BOT_TOKEN is not set', async () => {
    writeEnvFile('DATABASE_URL=postgres://u:p@h/d\n');

    await expect(service.read()).rejects.toThrow(
      /does not set DISCORD_BOT_TOKEN/,
    );
  });

  it('throws when DISCORD_BOT_TOKEN is set but empty', async () => {
    writeEnvFile('DISCORD_BOT_TOKEN=\n');

    await expect(service.read()).rejects.toThrow(/empty/i);
  });
});
