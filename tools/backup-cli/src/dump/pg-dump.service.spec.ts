import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { PG_DUMP_TIMEOUT_MS, PgDumpService } from './pg-dump.service';

const DATABASE_URL = 'postgresql://user:hunter2@ep-x.neon.tech/neondb';

describe('PgDumpService', () => {
  let service: PgDumpService;
  let processRunner: MockProxy<ProcessRunnerService>;
  let dir: string;
  let outputPath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pg-dump-'));
    outputPath = join(dir, 'backup.dump');
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PgDumpService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(PgDumpService);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs a custom-format, owner-less pg_dump of the whole database into the file', async () => {
    writeFileSync(outputPath, 'PGDMP-bytes');
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await expect(
      service.dump({ databaseUrl: DATABASE_URL, outputPath }),
    ).resolves.toBe(11);
    expect(processRunner.run).toHaveBeenCalledWith(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--no-password',
        `--file=${outputPath}`,
        `--dbname=${DATABASE_URL}`,
      ],
      PG_DUMP_TIMEOUT_MS,
    );
  });

  it('fails with pg_dump stderr, connection string redacted, on a non-zero exit', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: `pg_dump: error: connection to "${DATABASE_URL}" failed\n`,
    });

    const error = await service
      .dump({ databaseUrl: DATABASE_URL, outputPath })
      .then(
        () => undefined,
        (e: unknown) => e as Error,
      );

    expect(error?.message).toBe(
      'pg_dump exited with code 1: pg_dump: error: connection to "<database-url>" failed',
    );
    expect(error?.message).not.toContain('hunter2');
  });

  it('redacts the connection string when the runner rejects, e.g. pg_dump killed by a signal', async () => {
    processRunner.run.mockRejectedValue(
      new Error(
        `Command failed: pg_dump --format=custom --dbname=${DATABASE_URL}`,
      ),
    );

    const error = await service
      .dump({ databaseUrl: DATABASE_URL, outputPath })
      .then(
        () => undefined,
        (e: unknown) => e as Error,
      );

    expect(error?.message).toBe(
      'Command failed: pg_dump --format=custom --dbname=<database-url>',
    );
    expect(error?.cause).toBeUndefined();
  });

  it('redacts the bare password and stringifies a non-Error rejection', async () => {
    processRunner.run.mockRejectedValue(`auth failed for hunter2`);

    const error = await service
      .dump({ databaseUrl: DATABASE_URL, outputPath })
      .then(
        () => undefined,
        (e: unknown) => e as Error,
      );

    expect(error?.message).toBe('auth failed for <password>');
  });

  it('redacts a connection string that is not a parseable URL, without a password to scrub', async () => {
    processRunner.run.mockRejectedValue(new Error('failed for not-a-url'));

    const error = await service
      .dump({ databaseUrl: 'not-a-url', outputPath })
      .then(
        () => undefined,
        (e: unknown) => e as Error,
      );

    expect(error?.message).toBe('failed for <database-url>');
  });

  it('fails when pg_dump times out', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: TIMED_OUT_EXIT_CODE,
      stdout: '',
      stderr: '',
    });

    await expect(
      service.dump({ databaseUrl: DATABASE_URL, outputPath }),
    ).rejects.toThrow(/pg_dump timed out after 30 minutes/);
  });

  it('fails when pg_dump succeeded but wrote an empty file', async () => {
    writeFileSync(outputPath, '');
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await expect(
      service.dump({ databaseUrl: DATABASE_URL, outputPath }),
    ).rejects.toThrow(/empty dump/);
  });

  it('fails when pg_dump succeeded but wrote no file at all', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await expect(
      service.dump({ databaseUrl: DATABASE_URL, outputPath }),
    ).rejects.toThrow(/empty dump/);
  });
});
