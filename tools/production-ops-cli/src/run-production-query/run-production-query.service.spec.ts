import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ProductionEnvFileService } from '../production-env-file/production-env-file.service';
import { RunProductionQueryService } from './run-production-query.service';

describe('RunProductionQueryService', () => {
  let service: RunProductionQueryService;
  let processRunner: MockProxy<ProcessRunnerService>;
  let productionEnvFile: MockProxy<ProductionEnvFileService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    productionEnvFile = mock<ProductionEnvFileService>();
    productionEnvFile.readValue.mockResolvedValue(
      'postgres://user:pass@host/db',
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        RunProductionQueryService,
        { provide: ProcessRunnerService, useValue: processRunner },
        { provide: ProductionEnvFileService, useValue: productionEnvFile },
      ],
    }).compile();
    service = moduleRef.get(RunProductionQueryService);
  });

  it('runs the query wrapped in a read-only transaction with a transaction-local timeout, and a process-level kill deadline past it', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: ' ?column? \n----------\n        1\n(1 row)\n',
      stderr: '',
    });

    const result = await service.run("SELECT 1 WHERE status = 'active';");

    expect(productionEnvFile.readValue).toHaveBeenCalledWith('DATABASE_URL');
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

  it('passes a multi-line query containing a line that looks like a shell heredoc delimiter through unchanged', async () => {
    // The service never parses `query` as shell syntax — it's one `execFile`
    // argv entry — so a line matching a shell heredoc delimiter is inert here.
    const multilineQuery =
      "SELECT * FROM game_data.leagues WHERE name = 'QUERYEOF';\n" +
      'QUERYEOF\n' +
      "SELECT 'still just data, not a new shell command';";
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await service.run(multilineQuery);

    const [, args] = processRunner.run.mock.calls[0];
    expect(args).toContain(multilineQuery);
  });

  it('reports timedOut: true when the process-level deadline killed the query, closing a self-disabled SQL timeout', async () => {
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

  it('throws without spawning psql when DATABASE_URL is empty or malformed', async () => {
    productionEnvFile.readValue.mockResolvedValue('not-a-connection-string');

    await expect(service.run('SELECT 1;')).rejects.toThrow(
      /empty or malformed/,
    );
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('propagates the error from reading the production env file, without spawning psql', async () => {
    productionEnvFile.readValue.mockRejectedValue(
      new Error('apps/discord-bot/.env.production not found.'),
    );

    await expect(service.run('SELECT 1;')).rejects.toThrow(
      /apps\/discord-bot\/\.env\.production/,
    );
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('rejects a blank query before reading DATABASE_URL or spawning psql', async () => {
    // The blank-query check runs before any env-file read: if it ran after
    // credential reading, `productionEnvFile.readValue` would have been
    // called here, proving the check runs first.
    await expect(service.run('   \n\t  ')).rejects.toThrow(
      /query text is empty/i,
    );
    expect(productionEnvFile.readValue).not.toHaveBeenCalled();
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('rejects a query beginning with a psql meta-command before reading DATABASE_URL or spawning psql', async () => {
    // psql's -c accepts either SQL or a single backslash meta-command --
    // `\!` shells out to the LOCAL machine, entirely outside the database
    // and its read-only transaction. Proves this check runs before any
    // env-file read, for the same reason as the blank-query test above.
    await expect(
      service.run('\\! printf "meta-command-executed"'),
    ).rejects.toThrow(/meta-command/i);
    expect(productionEnvFile.readValue).not.toHaveBeenCalled();
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('rejects a meta-command query even with leading whitespace before the backslash', async () => {
    await expect(service.run('  \\dt')).rejects.toThrow(/meta-command/i);
    expect(productionEnvFile.readValue).not.toHaveBeenCalled();
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('allows a backslash that is not the first character -- psql only treats a leading backslash as a meta-command', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await service.run("SELECT 1; \\! printf 'not actually a meta-command';");

    const [, args] = processRunner.run.mock.calls[0];
    expect(args).toContain(
      "SELECT 1; \\! printf 'not actually a meta-command';",
    );
  });
});
