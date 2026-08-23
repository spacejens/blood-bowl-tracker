import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { GitRootsService } from '../shared/git-roots.service';
import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '../shared/process-runner.service';
import { RunProductionQueryService } from './run-production-query.service';

describe('RunProductionQueryService', () => {
  let service: RunProductionQueryService;
  let processRunner: MockProxy<ProcessRunnerService>;
  let gitRoots: MockProxy<GitRootsService>;
  let worktreeRoot: string;
  let envPath: string;

  beforeEach(async () => {
    worktreeRoot = mkdtempSync(join(tmpdir(), 'run-production-query-'));
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
        RunProductionQueryService,
        { provide: ProcessRunnerService, useValue: processRunner },
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(RunProductionQueryService);
  });

  afterEach(() => {
    rmSync(worktreeRoot, { recursive: true, force: true });
  });

  function writeEnvFile(contents: string): void {
    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, contents, 'utf8');
  }

  it('runs the query wrapped in a read-only transaction with a transaction-local timeout, and a process-level kill deadline past it', async () => {
    writeEnvFile('DATABASE_URL=postgres://user:pass@host/db\n');
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: ' ?column? \n----------\n        1\n(1 row)\n',
      stderr: '',
    });

    const result = await service.run("SELECT 1 WHERE status = 'active';");

    expect(processRunner.run).toHaveBeenCalledWith(
      'psql',
      [
        'postgres://user:pass@host/db',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'BEGIN TRANSACTION READ ONLY;',
        '-c',
        "SET LOCAL statement_timeout = '30s';",
        '-c',
        "SELECT 1 WHERE status = 'active';",
        '-c',
        'COMMIT;',
      ],
      35_000,
    );
    expect(result).toEqual({
      exitCode: 0,
      stdout: ' ?column? \n----------\n        1\n(1 row)\n',
      stderr: '',
      timedOut: false,
    });
  });

  it('passes the query as a single argv entry, so embedded quotes need no shell-level escaping', async () => {
    writeEnvFile('DATABASE_URL=postgres://user:pass@host/db\n');
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await service.run(
      "SET LOCAL statement_timeout = 0; SELECT 1 WHERE 'a''b' = 'a''b';",
    );

    const [, args] = processRunner.run.mock.calls[0];
    expect(args).toContain(
      "SET LOCAL statement_timeout = 0; SELECT 1 WHERE 'a''b' = 'a''b';",
    );
  });

  it('reports timedOut: true when the process-level deadline killed the query, closing a self-disabled SQL timeout', async () => {
    writeEnvFile('DATABASE_URL=postgres://user:pass@host/db\n');
    processRunner.run.mockResolvedValue({
      exitCode: TIMED_OUT_EXIT_CODE,
      stdout: 'BEGIN\nSET\n',
      stderr: '',
    });

    const result = await service.run(
      'SET LOCAL statement_timeout = 0; SELECT pg_sleep(60);',
    );

    expect(result.timedOut).toBe(true);
  });

  it('strips a dotenv-style surrounding quote pair and trailing CRLF from DATABASE_URL', async () => {
    writeEnvFile('DATABASE_URL="postgres://user:pass@host/db"\r\n');
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await service.run('SELECT 1;');

    const [, args] = processRunner.run.mock.calls[0];
    expect(args[0]).toBe('postgres://user:pass@host/db');
  });

  it('throws without spawning psql when .env.production does not exist', async () => {
    await expect(service.run('SELECT 1;')).rejects.toThrow(
      /apps\/discord-bot\/\.env\.production/,
    );
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('throws without spawning psql when DATABASE_URL is not set', async () => {
    writeEnvFile('OTHER_VAR=1\n');

    await expect(service.run('SELECT 1;')).rejects.toThrow(/DATABASE_URL/);
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('throws without spawning psql when DATABASE_URL is empty or malformed', async () => {
    writeEnvFile('DATABASE_URL=not-a-connection-string\n');

    await expect(service.run('SELECT 1;')).rejects.toThrow(
      /empty or malformed/,
    );
    expect(processRunner.run).not.toHaveBeenCalled();
  });
});
