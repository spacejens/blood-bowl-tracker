import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { GitRootsService } from '../shared/git-roots.service';
import { ProcessRunnerService } from '../shared/process-runner.service';
import { ResetProductionSchemaService } from './reset-production-schema.service';

describe('ResetProductionSchemaService', () => {
  let service: ResetProductionSchemaService;
  let processRunner: MockProxy<ProcessRunnerService>;
  let gitRoots: MockProxy<GitRootsService>;
  let worktreeRoot: string;
  let envPath: string;

  beforeEach(async () => {
    worktreeRoot = mkdtempSync(join(tmpdir(), 'reset-production-schema-'));
    envPath = join(worktreeRoot, 'apps/discord-bot/.env.production');

    processRunner = mock<ProcessRunnerService>();
    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot: worktreeRoot,
      worktreeRoot,
      isWorktree: false,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResetProductionSchemaService,
        { provide: ProcessRunnerService, useValue: processRunner },
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(ResetProductionSchemaService);
  });

  afterEach(() => {
    rmSync(worktreeRoot, { recursive: true, force: true });
  });

  function writeEnvFile(contents: string): void {
    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, contents, 'utf8');
  }

  it('drops game_data, public, and drizzle, and recreates an empty public schema', async () => {
    writeEnvFile('DATABASE_URL=postgres://user:pass@host/db\n');
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: 'DROP SCHEMA\nDROP SCHEMA\nCREATE SCHEMA\nDROP SCHEMA\n',
      stderr: '',
    });

    const result = await service.run();

    expect(processRunner.run).toHaveBeenCalledWith(
      'psql',
      [
        'postgres://user:pass@host/db',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'DROP SCHEMA IF EXISTS game_data CASCADE;',
        '-c',
        'DROP SCHEMA IF EXISTS public CASCADE;',
        '-c',
        'CREATE SCHEMA public;',
        '-c',
        'DROP SCHEMA IF EXISTS drizzle CASCADE;',
      ],
      30_000,
    );
    expect(result).toEqual({
      exitCode: 0,
      stdout: 'DROP SCHEMA\nDROP SCHEMA\nCREATE SCHEMA\nDROP SCHEMA\n',
      stderr: '',
    });
  });

  it('drops game_data before public, so triggers referencing public functions are gone by the time game_data itself goes -- order does not actually matter for correctness (CASCADE handles either order), but this pins the documented order', async () => {
    writeEnvFile('DATABASE_URL=postgres://user:pass@host/db\n');
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await service.run();

    const [, args] = processRunner.run.mock.calls[0];
    const gameDataIndex = args.indexOf(
      'DROP SCHEMA IF EXISTS game_data CASCADE;',
    );
    const publicDropIndex = args.indexOf(
      'DROP SCHEMA IF EXISTS public CASCADE;',
    );
    expect(gameDataIndex).toBeGreaterThanOrEqual(0);
    expect(publicDropIndex).toBeGreaterThan(gameDataIndex);
  });

  it('strips a dotenv-style surrounding quote pair and trailing CRLF from DATABASE_URL', async () => {
    writeEnvFile('DATABASE_URL="postgres://user:pass@host/db"\r\n');
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await service.run();

    const [, args] = processRunner.run.mock.calls[0];
    expect(args[0]).toBe('postgres://user:pass@host/db');
  });

  it('throws without spawning psql when .env.production does not exist', async () => {
    await expect(service.run()).rejects.toThrow(
      /apps\/discord-bot\/\.env\.production/,
    );
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('throws without spawning psql when DATABASE_URL is not set', async () => {
    writeEnvFile('OTHER_VAR=1\n');

    await expect(service.run()).rejects.toThrow(/DATABASE_URL/);
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('throws without spawning psql when DATABASE_URL is empty or malformed', async () => {
    writeEnvFile('DATABASE_URL=not-a-connection-string\n');

    await expect(service.run()).rejects.toThrow(/empty or malformed/);
    expect(processRunner.run).not.toHaveBeenCalled();
  });
});
