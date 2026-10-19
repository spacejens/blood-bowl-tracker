import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BatchRunnerService } from '../batches/batch-runner.service';
import { ManualImportService } from '../import/manual-import.service';
import { ImportManualCliService } from './import-manual-cli.service';
import { DEFAULT_MANUAL_DATA_DIR, MANUAL_DATA_DIR } from './manual-data-dir';

const DATA = '/repo/tools/import-manual/data';

const run = (cli: ImportManualCliService, ...args: string[]) =>
  cli.execute({ args, cwd: '/somewhere' });

describe('ImportManualCliService', () => {
  let cli: ImportManualCliService;
  let runner: MockProxy<BatchRunnerService>;
  let manualImport: MockProxy<ManualImportService>;

  beforeEach(async () => {
    runner = mock<BatchRunnerService>();
    manualImport = mock<ManualImportService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportManualCliService,
        { provide: MANUAL_DATA_DIR, useValue: DATA },
        { provide: BatchRunnerService, useValue: runner },
        { provide: ManualImportService, useValue: manualImport },
      ],
    }).compile();
    cli = moduleRef.get(ImportManualCliService);
  });

  it('applies every unapplied batch against the tool data directory', async () => {
    runner.apply.mockResolvedValue({
      applied: ['001-initial-seed', '002-initial-cleanup'],
      skipped: [],
      failed: undefined,
      imported: 12,
    });

    expect(await run(cli, 'apply')).toEqual({
      stdout: [
        'Applied batch 001-initial-seed.',
        'Applied batch 002-initial-cleanup.',
        'Imported 12 record(s) successfully.',
      ],
      stderr: [],
      exitCode: 0,
    });
    expect(runner.apply).toHaveBeenCalledWith({
      dataDir: DATA,
      batch: undefined,
    });
  });

  it('applies exactly the named batch', async () => {
    runner.apply.mockResolvedValue({
      applied: ['001-initial-seed'],
      skipped: [],
      failed: undefined,
      imported: 7,
    });

    const outcome = await run(cli, 'apply', '001-initial-seed');

    expect(runner.apply).toHaveBeenCalledWith({
      dataDir: DATA,
      batch: '001-initial-seed',
    });
    expect(outcome.stdout).toEqual([
      'Applied batch 001-initial-seed.',
      'Imported 7 record(s) successfully.',
    ]);
  });

  it('reports skipped batches', async () => {
    runner.apply.mockResolvedValue({
      applied: [],
      skipped: ['002-initial-cleanup'],
      failed: undefined,
      imported: 0,
    });

    const outcome = await run(cli, 'apply');

    expect(outcome.stdout).toEqual([
      'Skipped batch 002-initial-cleanup (already applied).',
      'Imported 0 record(s) successfully.',
    ]);
    expect(outcome.exitCode).toBe(0);
  });

  it('reports a failed batch with its errors and a fresh-database hint, and exits 1', async () => {
    runner.apply.mockResolvedValue({
      applied: ['003-x'],
      skipped: [],
      failed: {
        name: '004-y',
        errors: [{ item: {}, message: 'Cannot import race "R".' }],
      },
      imported: 5,
    });

    expect(await run(cli, 'apply')).toEqual({
      stdout: ['Applied batch 003-x.'],
      stderr: [
        'Import completed with 1 errors:',
        '  - Cannot import race "R".',
        'Batch 004-y was not recorded as applied; later batches were not attempted.',
        'On a fresh database apply the first batch, run the BBL and TP importers, then apply the rest.',
      ],
      exitCode: 1,
    });
  });

  it('marks the named batches applied', async () => {
    runner.markApplied.mockResolvedValue({
      recorded: ['002-initial-cleanup'],
      alreadyRecorded: ['001-initial-seed'],
    });

    expect(
      await run(cli, 'mark-applied', '001-initial-seed', '002-initial-cleanup'),
    ).toEqual({
      stdout: [
        'Batch 001-initial-seed was already recorded as applied.',
        'Recorded batch 002-initial-cleanup as applied, without importing it.',
      ],
      stderr: [],
      exitCode: 0,
    });
    expect(runner.markApplied).toHaveBeenCalledWith(
      ['001-initial-seed', '002-initial-cleanup'],
      DATA,
    );
  });

  it('imports any other argument as a directory, relative to cwd, recording nothing', async () => {
    manualImport.run.mockResolvedValue({
      success: true,
      imported: 3,
      errors: [],
    });

    expect(await run(cli, 'scratch/extra')).toEqual({
      stdout: ['Imported 3 record(s) successfully.'],
      stderr: [],
      exitCode: 0,
    });
    expect(manualImport.run).toHaveBeenCalledWith('/somewhere/scratch/extra');
    expect(runner.apply).not.toHaveBeenCalled();
  });

  it('reports a directory import with errors and exits 1', async () => {
    manualImport.run.mockResolvedValue({
      success: false,
      imported: 0,
      errors: [{ item: {}, message: 'bad' }],
    });

    expect(await run(cli, '/abs/dir')).toEqual({
      stdout: [],
      stderr: ['Import completed with 1 errors:', '  - bad'],
      exitCode: 1,
    });
  });

  it('throws the usage text when apply is given more than one batch', async () => {
    await expect(
      cli.execute({
        args: ['apply', '002-initial-cleanup', '003-reset-curated-names'],
        cwd: '/',
      }),
    ).rejects.toThrow(/Usage:.*apply \[<batch>\]/);
    expect(runner.apply).not.toHaveBeenCalled();
  });

  it.each([[[]], [['']]])('throws the usage text for %j', async (args) => {
    await expect(cli.execute({ args, cwd: '/' })).rejects.toThrow(
      /Usage:.*apply \[<batch>\].*mark-applied/,
    );
  });
});

describe('DEFAULT_MANUAL_DATA_DIR', () => {
  it('is the directory holding the committed batches', () => {
    expect(
      existsSync(join(DEFAULT_MANUAL_DATA_DIR, 'batches', '001-initial-seed')),
    ).toBe(true);
  });
});
