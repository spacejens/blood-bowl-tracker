import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DatabaseUrlRedactorService } from './database-url-redactor.service';
import { PgClientRequest, PgClientService } from './pg-client.service';

const DATABASE_URL = 'postgresql://postgres:s3cret@localhost:5432/postgres';

const REQUEST: PgClientRequest = {
  program: 'psql',
  args: ['--no-psqlrc', '--command=SELECT 1;'],
  databaseUrl: DATABASE_URL,
  timeoutMs: 5 * 60 * 1000,
};

describe('PgClientService', () => {
  let service: PgClientService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PgClientService,
        // Pure, dependency-free formatting service: passed real.
        DatabaseUrlRedactorService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(PgClientService);
  });

  async function failure(): Promise<Error | undefined> {
    return service.run(REQUEST).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
  }

  it('runs the program with --dbname first and returns stdout', async () => {
    processRunner.runWithOptions.mockResolvedValue({
      exitCode: 0,
      stdout: '1\n',
      stderr: '',
    });

    await expect(service.run(REQUEST)).resolves.toBe('1\n');
    expect(processRunner.runWithOptions).toHaveBeenCalledWith(
      'psql',
      [`--dbname=${DATABASE_URL}`, '--no-psqlrc', '--command=SELECT 1;'],
      { timeoutMs: REQUEST.timeoutMs, env: expect.any(Object) as unknown },
    );
  });

  it('removes the libpq variables that could redirect the connection from the child env, keeping the rest', async () => {
    vi.stubEnv('PGHOSTADDR', '10.0.0.1');
    vi.stubEnv('PGHOST', 'db.example.com');
    vi.stubEnv('PGSERVICE', 'prod');
    vi.stubEnv('PGSERVICEFILE', '/tmp/service');
    vi.stubEnv('PGSSLMODE', 'require');
    processRunner.runWithOptions.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await service.run(REQUEST);

    const env = processRunner.runWithOptions.mock.calls[0][2].env ?? {};
    vi.unstubAllEnvs();
    expect(env).not.toHaveProperty('PGHOSTADDR');
    expect(env).not.toHaveProperty('PGHOST');
    expect(env).not.toHaveProperty('PGSERVICE');
    expect(env).not.toHaveProperty('PGSERVICEFILE');
    expect(env.PGSSLMODE).toBe('require');
    expect(env.PATH).toBe(process.env.PATH);
  });

  it('fails with redacted, trimmed stderr on a non-zero exit', async () => {
    processRunner.runWithOptions.mockResolvedValue({
      exitCode: 2,
      stdout: '',
      stderr: `psql: error: connection to "${DATABASE_URL}" failed\n`,
    });

    const error = await failure();

    expect(error?.message).toBe(
      'psql exited with code 2: psql: error: connection to "postgresql://postgres:<password>@localhost:5432/postgres" failed',
    );
  });

  it('fails when the program times out', async () => {
    processRunner.runWithOptions.mockResolvedValue({
      exitCode: TIMED_OUT_EXIT_CODE,
      stdout: '',
      stderr: '',
    });

    await expect(service.run(REQUEST)).rejects.toThrow(
      'psql timed out after 5 minutes.',
    );
  });

  it('redacts the URL and drops the cause when the runner rejects', async () => {
    processRunner.runWithOptions.mockRejectedValue(
      new Error(`Command failed: psql --dbname=${DATABASE_URL}`),
    );

    const error = await failure();

    expect(error?.message).toBe(
      'Command failed: psql --dbname=postgresql://postgres:<password>@localhost:5432/postgres',
    );
    expect(error?.cause).toBeUndefined();
  });

  it('stringifies a non-Error rejection', async () => {
    processRunner.runWithOptions.mockRejectedValue(
      `spawn failed for ${DATABASE_URL}`,
    );

    const error = await failure();

    expect(error?.message).toBe(
      'spawn failed for postgresql://postgres:<password>@localhost:5432/postgres',
    );
  });
});
