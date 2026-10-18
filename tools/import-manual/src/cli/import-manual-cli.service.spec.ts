import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BatchRunnerService } from '../batches/batch-runner.service';
import { ManualImportService } from '../import/manual-import.service';
import { ImportManualCliService } from './import-manual-cli.service';
import { DEFAULT_MANUAL_DATA_DIR, MANUAL_DATA_DIR } from './manual-data-dir';

const DATA = '/repo/tools/import-manual/data';

async function makeService(): Promise<{
  cli: ImportManualCliService;
  runner: MockProxy<BatchRunnerService>;
  manualImport: MockProxy<ManualImportService>;
}> {
  const runner = mock<BatchRunnerService>();
  const manualImport = mock<ManualImportService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      ImportManualCliService,
      { provide: MANUAL_DATA_DIR, useValue: DATA },
      { provide: BatchRunnerService, useValue: runner },
      { provide: ManualImportService, useValue: manualImport },
    ],
  }).compile();
  return { cli: moduleRef.get(ImportManualCliService), runner, manualImport };
}

const run = (cli: ImportManualCliService, ...args: string[]) =>
  cli.execute({ args, cwd: '/somewhere' });

describe('ImportManualCliService', () => {
  it('runs the before phase against the tool data directory', async () => {
    const { cli, runner } = await makeService();
    runner.runPhase.mockResolvedValue({
      applied: ['001-before-initial-sources'],
      skipped: [],
      failed: undefined,
      imported: 12,
    });

    expect(await run(cli, 'before-sources')).toEqual({
      stdout: [
        'Applied batch 001-before-initial-sources.',
        'Imported 12 record(s) successfully.',
      ],
      stderr: [],
      exitCode: 0,
    });
    expect(runner.runPhase).toHaveBeenCalledWith('before', DATA);
  });

  it('reports skipped batches of the after phase', async () => {
    const { cli, runner } = await makeService();
    runner.runPhase.mockResolvedValue({
      applied: [],
      skipped: ['002-after-initial-sources'],
      failed: undefined,
      imported: 0,
    });

    const outcome = await run(cli, 'after-sources');

    expect(runner.runPhase).toHaveBeenCalledWith('after', DATA);
    expect(outcome.stdout).toEqual([
      'Skipped batch 002-after-initial-sources (already applied).',
      'Imported 0 record(s) successfully.',
    ]);
    expect(outcome.exitCode).toBe(0);
  });

  it('reports a failed batch with its errors and exits 1', async () => {
    const { cli, runner } = await makeService();
    runner.runPhase.mockResolvedValue({
      applied: ['003-after-x'],
      skipped: [],
      failed: {
        name: '004-after-y',
        errors: [{ item: {}, message: 'Cannot import race "R".' }],
      },
      imported: 5,
    });

    expect(await run(cli, 'after-sources')).toEqual({
      stdout: ['Applied batch 003-after-x.'],
      stderr: [
        'Import completed with 1 errors:',
        '  - Cannot import race "R".',
        'Batch 004-after-y was not recorded as applied; later batches were not attempted.',
      ],
      exitCode: 1,
    });
  });

  it('marks the named batches applied', async () => {
    const { cli, runner } = await makeService();
    runner.markApplied.mockResolvedValue({
      recorded: ['002-after-initial-sources'],
      alreadyRecorded: ['001-before-initial-sources'],
    });

    expect(
      await run(
        cli,
        'mark-applied',
        '001-before-initial-sources',
        '002-after-initial-sources',
      ),
    ).toEqual({
      stdout: [
        'Batch 001-before-initial-sources was already recorded as applied.',
        'Recorded batch 002-after-initial-sources as applied, without importing it.',
      ],
      stderr: [],
      exitCode: 0,
    });
    expect(runner.markApplied).toHaveBeenCalledWith(
      ['001-before-initial-sources', '002-after-initial-sources'],
      DATA,
    );
  });

  it('imports any other argument as a directory, relative to cwd, recording nothing', async () => {
    const { cli, runner, manualImport } = await makeService();
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
    expect(runner.runPhase).not.toHaveBeenCalled();
  });

  it('reports a directory import with errors and exits 1', async () => {
    const { cli, manualImport } = await makeService();
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

  it.each([[[]], [['']]])('throws the usage text for %j', async (args) => {
    const { cli } = await makeService();

    await expect(cli.execute({ args, cwd: '/' })).rejects.toThrow(/Usage:/);
  });
});

describe('DEFAULT_MANUAL_DATA_DIR', () => {
  it('is the directory holding the committed batches', () => {
    expect(
      existsSync(
        join(DEFAULT_MANUAL_DATA_DIR, 'batches', '001-before-initial-sources'),
      ),
    ).toBe(true);
  });
});
