import {
  PgClientService,
  ProductionEnvFileService,
  TIMED_OUT_EXIT_CODE,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { RunProductionQueryService } from './run-production-query.service';

const DATABASE_URL = 'postgres://user:pass@host/db';

const SUCCESS = {
  exitCode: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
};

describe('RunProductionQueryService', () => {
  let service: RunProductionQueryService;
  let pgClient: MockProxy<PgClientService>;
  let productionEnvFile: MockProxy<ProductionEnvFileService>;

  beforeEach(async () => {
    pgClient = mock<PgClientService>();
    productionEnvFile = mock<ProductionEnvFileService>();
    productionEnvFile.readDatabaseUrl.mockResolvedValue(DATABASE_URL);

    const moduleRef = await Test.createTestingModule({
      providers: [
        RunProductionQueryService,
        { provide: PgClientService, useValue: pgClient },
        { provide: ProductionEnvFileService, useValue: productionEnvFile },
      ],
    }).compile();
    service = moduleRef.get(RunProductionQueryService);
  });

  function firstCallArgs(): readonly string[] {
    return pgClient.runToResult.mock.calls[0][0].args;
  }

  it('runs psql through the guarded client, wrapped in a read-only transaction with a transaction-local timeout and a process deadline past it', async () => {
    pgClient.runToResult.mockResolvedValue({
      exitCode: 0,
      stdout: ' ?column? \n----------\n        1\n(1 row)\n',
      stderr: '',
      timedOut: false,
    });

    const result = await service.run("SELECT 1 WHERE status = 'active';");

    expect(productionEnvFile.readDatabaseUrl).toHaveBeenCalledOnce();
    expect(pgClient.runToResult).toHaveBeenCalledWith({
      program: 'psql',
      args: [
        '--no-psqlrc',
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
      databaseUrl: DATABASE_URL,
      timeoutMs: 35_000,
    });
    expect(result).toEqual({
      exitCode: 0,
      stdout: ' ?column? \n----------\n        1\n(1 row)\n',
      stderr: '',
      timedOut: false,
    });
  });

  it('never puts the URL among the args, so the guarded client passes it only as --dbname', async () => {
    pgClient.runToResult.mockResolvedValue(SUCCESS);

    await service.run('SELECT 1;');

    expect(firstCallArgs()).not.toContain(DATABASE_URL);
  });

  it('passes the query as a single argv entry, so embedded quotes need no shell-level escaping', async () => {
    pgClient.runToResult.mockResolvedValue(SUCCESS);

    await service.run(
      "SET LOCAL statement_timeout = 0; SELECT 1 WHERE 'a''b' = 'a''b';",
    );

    expect(firstCallArgs()).toContain(
      "SET LOCAL statement_timeout = 0; SELECT 1 WHERE 'a''b' = 'a''b';",
    );
  });

  it('passes a multi-line query containing a line that looks like a shell heredoc delimiter through unchanged', async () => {
    // The query is one `execFile` argv entry, never shell syntax, so a line
    // matching a shell heredoc delimiter is inert here.
    const multilineQuery =
      "SELECT * FROM game_data.leagues WHERE name = 'QUERYEOF';\n" +
      'QUERYEOF\n' +
      "SELECT 'still just data, not a new shell command';";
    pgClient.runToResult.mockResolvedValue(SUCCESS);

    await service.run(multilineQuery);

    expect(firstCallArgs()).toContain(multilineQuery);
  });

  it('reports the client result for a non-zero exit as data, stderr included', async () => {
    pgClient.runToResult.mockResolvedValue({
      exitCode: 3,
      stdout: 'BEGIN\n',
      stderr: 'ERROR:  cannot execute INSERT in a read-only transaction\n',
      timedOut: false,
    });

    await expect(service.run('INSERT INTO t VALUES (1);')).resolves.toEqual({
      exitCode: 3,
      stdout: 'BEGIN\n',
      stderr: 'ERROR:  cannot execute INSERT in a read-only transaction\n',
      timedOut: false,
    });
  });

  it('reports timedOut: true when the process-level deadline killed the query, closing a self-disabled SQL timeout', async () => {
    pgClient.runToResult.mockResolvedValue({
      exitCode: TIMED_OUT_EXIT_CODE,
      stdout: 'BEGIN\nSET\n',
      stderr: '',
      timedOut: true,
    });

    const result = await service.run(
      'SET LOCAL statement_timeout = 0; SELECT pg_sleep(60);',
    );

    expect(result).toEqual({
      exitCode: TIMED_OUT_EXIT_CODE,
      stdout: 'BEGIN\nSET\n',
      stderr: '',
      timedOut: true,
    });
  });

  it('propagates a failure to run psql at all', async () => {
    pgClient.runToResult.mockRejectedValue(new Error('spawn psql ENOENT'));

    await expect(service.run('SELECT 1;')).rejects.toThrow('spawn psql ENOENT');
  });

  it('propagates the error from reading DATABASE_URL, without running psql', async () => {
    productionEnvFile.readDatabaseUrl.mockRejectedValue(
      new Error(
        'DATABASE_URL in apps/discord-bot/.env.production is empty or not a ' +
          'postgres:// or postgresql:// connection string; aborting without connecting.',
      ),
    );

    await expect(service.run('SELECT 1;')).rejects.toThrow(
      /DATABASE_URL in apps\/discord-bot\/\.env\.production/,
    );
    expect(pgClient.runToResult).not.toHaveBeenCalled();
  });

  it('rejects a blank query before reading DATABASE_URL or running psql', async () => {
    // If this check ran after credential reading, readDatabaseUrl would have
    // been called here.
    await expect(service.run('   \n\t  ')).rejects.toThrow(
      /query text is empty/i,
    );
    expect(productionEnvFile.readDatabaseUrl).not.toHaveBeenCalled();
    expect(pgClient.runToResult).not.toHaveBeenCalled();
  });

  it('rejects a query beginning with a psql meta-command before reading DATABASE_URL or running psql', async () => {
    // psql's -c accepts either SQL or a single backslash meta-command --
    // `\!` shells out to the LOCAL machine, entirely outside the database
    // and its read-only transaction.
    await expect(
      service.run('\\! printf "meta-command-executed"'),
    ).rejects.toThrow(/meta-command/i);
    expect(productionEnvFile.readDatabaseUrl).not.toHaveBeenCalled();
    expect(pgClient.runToResult).not.toHaveBeenCalled();
  });

  it('rejects a meta-command query even with leading whitespace before the backslash', async () => {
    await expect(service.run('  \\dt')).rejects.toThrow(/meta-command/i);
    expect(productionEnvFile.readDatabaseUrl).not.toHaveBeenCalled();
    expect(pgClient.runToResult).not.toHaveBeenCalled();
  });

  it('allows a backslash that is not the first character -- psql only treats a leading backslash as a meta-command', async () => {
    pgClient.runToResult.mockResolvedValue(SUCCESS);

    await service.run("SELECT 1; \\! printf 'not actually a meta-command';");

    expect(firstCallArgs()).toContain(
      "SELECT 1; \\! printf 'not actually a meta-command';",
    );
  });
});
