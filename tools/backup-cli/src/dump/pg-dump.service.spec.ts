import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PgClientService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { PG_DUMP_TIMEOUT_MS, PgDumpService } from './pg-dump.service';

const DATABASE_URL = 'postgresql://user:hunter2@ep-x.neon.tech/neondb';

describe('PgDumpService', () => {
  let service: PgDumpService;
  let pgClient: MockProxy<PgClientService>;
  let dir: string;
  let outputPath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pg-dump-'));
    outputPath = join(dir, 'backup.dump');
    pgClient = mock<PgClientService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PgDumpService,
        { provide: PgClientService, useValue: pgClient },
      ],
    }).compile();
    service = moduleRef.get(PgDumpService);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs a custom-format, owner-less pg_dump of the whole database into the file', async () => {
    writeFileSync(outputPath, 'PGDMP-bytes');
    pgClient.run.mockResolvedValue('');

    await expect(
      service.dump({ databaseUrl: DATABASE_URL, outputPath }),
    ).resolves.toBe(11);
    expect(pgClient.run).toHaveBeenCalledWith({
      program: 'pg_dump',
      args: [
        '--format=custom',
        '--no-owner',
        '--no-password',
        `--file=${outputPath}`,
      ],
      databaseUrl: DATABASE_URL,
      timeoutMs: PG_DUMP_TIMEOUT_MS,
    });
  });

  it('propagates a failure from the guarded client', async () => {
    pgClient.run.mockRejectedValue(new Error('pg_dump exited with code 1: x'));

    await expect(
      service.dump({ databaseUrl: DATABASE_URL, outputPath }),
    ).rejects.toThrow('pg_dump exited with code 1: x');
  });

  it('fails when pg_dump succeeded but wrote an empty file', async () => {
    writeFileSync(outputPath, '');
    pgClient.run.mockResolvedValue('');

    await expect(
      service.dump({ databaseUrl: DATABASE_URL, outputPath }),
    ).rejects.toThrow(/empty dump/);
  });

  it('fails when pg_dump succeeded but wrote no file at all', async () => {
    pgClient.run.mockResolvedValue('');

    await expect(
      service.dump({ databaseUrl: DATABASE_URL, outputPath }),
    ).rejects.toThrow(/empty dump/);
  });
});
