import type { ImportResult } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ManualDataReader } from '../data-file/manual-data-reader.service';
import { ManualImportService } from '../import/manual-import.service';
import { BatchCatalogService } from './batch-catalog.service';
import { BatchContentHashService } from './batch-content-hash.service';
import { BatchLedgerService } from './batch-ledger.service';
import { BatchRunnerService } from './batch-runner.service';
import type { ManualBatch, RecordedBatch } from './manual-batch';

const DATA = '/data';

function batch(name: string): ManualBatch {
  return {
    name,
    number: Number(name.slice(0, 3)),
    dir: `${DATA}/batches/${name}`,
  };
}

const B1 = batch('001-a');
const B2 = batch('002-b');
const B3 = batch('003-c');

/** The canned hash the stubbed hasher answers for one batch's content. */
const hashOf = (b: ManualBatch) => `hash-of-${b.name}`;
const recordedAs = (b: ManualBatch): RecordedBatch => ({
  name: b.name,
  contentHash: hashOf(b),
});

const ok = (imported: number): ImportResult => ({
  success: true,
  imported,
  errors: [],
});

interface Seed {
  batches?: ManualBatch[];
  recorded?: RecordedBatch[];
  results?: Record<string, ImportResult>;
}

async function makeService(seed: Seed = {}) {
  const batches = seed.batches ?? [B1, B2, B3];
  const catalog = mock<BatchCatalogService>();
  catalog.discover.mockResolvedValue(batches);
  // The raw content stub carries the batch's directory, so the hasher stub
  // can answer each batch's canned hash.
  const reader = mock<ManualDataReader>();
  reader.readRaw.mockImplementation((dir) => Promise.resolve({ dir: [dir] }));
  const hasher = mock<BatchContentHashService>();
  hasher.hash.mockImplementation((raw) => {
    const found = batches.find((b) => b.dir === raw.dir[0]);
    return found === undefined ? 'unknown' : hashOf(found);
  });
  const ledger = mock<BatchLedgerService>();
  ledger.list.mockResolvedValue(seed.recorded ?? []);
  ledger.record.mockResolvedValue();
  const manualImport = mock<ManualImportService>();
  manualImport.run.mockImplementation((dir) =>
    Promise.resolve(seed.results?.[dir] ?? ok(1)),
  );
  const moduleRef = await Test.createTestingModule({
    providers: [
      BatchRunnerService,
      { provide: BatchCatalogService, useValue: catalog },
      { provide: ManualDataReader, useValue: reader },
      { provide: BatchContentHashService, useValue: hasher },
      { provide: BatchLedgerService, useValue: ledger },
      { provide: ManualImportService, useValue: manualImport },
    ],
  }).compile();
  return {
    runner: moduleRef.get(BatchRunnerService),
    catalog,
    ledger,
    manualImport,
  };
}

describe('BatchRunnerService.apply', () => {
  describe('without a batch name', () => {
    it('applies and records every unapplied batch, in order', async () => {
      const { runner, ledger, manualImport } = await makeService();

      const outcome = await runner.apply({ dataDir: DATA });

      expect(outcome).toEqual({
        applied: [B1.name, B2.name, B3.name],
        skipped: [],
        failed: undefined,
        imported: 3,
      });
      expect(manualImport.run.mock.calls).toEqual([
        [B1.dir],
        [B2.dir],
        [B3.dir],
      ]);
      expect(ledger.record.mock.calls).toEqual([
        [recordedAs(B1)],
        [recordedAs(B2)],
        [recordedAs(B3)],
      ]);
      // Each batch is recorded right after its own import, before the next.
      expect(ledger.record.mock.invocationCallOrder[0]).toBeLessThan(
        manualImport.run.mock.invocationCallOrder[1],
      );
    });

    it('skips recorded batches', async () => {
      const { runner, manualImport } = await makeService({
        recorded: [recordedAs(B1), recordedAs(B2)],
      });

      const outcome = await runner.apply({ dataDir: DATA });

      expect(outcome.skipped).toEqual([B1.name, B2.name]);
      expect(outcome.applied).toEqual([B3.name]);
      expect(manualImport.run.mock.calls).toEqual([[B3.dir]]);
    });

    it('applies nothing when every batch is recorded', async () => {
      const { runner, ledger, manualImport } = await makeService({
        recorded: [recordedAs(B1), recordedAs(B2), recordedAs(B3)],
      });

      expect(await runner.apply({ dataDir: DATA })).toEqual({
        applied: [],
        skipped: [B1.name, B2.name, B3.name],
        failed: undefined,
        imported: 0,
      });
      expect(manualImport.run).not.toHaveBeenCalled();
      expect(ledger.record).not.toHaveBeenCalled();
    });

    it('stops at the first batch with errors and leaves it unrecorded', async () => {
      const errors = [{ item: {}, message: 'Cannot import x.' }];
      const { runner, ledger, manualImport } = await makeService({
        recorded: [recordedAs(B1)],
        results: { [B2.dir]: { success: false, imported: 4, errors } },
      });

      expect(await runner.apply({ dataDir: DATA })).toEqual({
        applied: [],
        skipped: [B1.name],
        failed: { name: B2.name, errors },
        imported: 4,
      });
      expect(manualImport.run.mock.calls).toEqual([[B2.dir]]);
      expect(ledger.record).not.toHaveBeenCalled();
    });
  });

  describe('with a batch name', () => {
    it('applies exactly that batch when every lower-numbered batch is recorded', async () => {
      const { runner, ledger, manualImport } = await makeService({
        recorded: [recordedAs(B1)],
      });

      const outcome = await runner.apply({ dataDir: DATA, batch: B2.name });

      expect(outcome).toEqual({
        applied: [B2.name],
        skipped: [],
        failed: undefined,
        imported: 1,
      });
      expect(manualImport.run.mock.calls).toEqual([[B2.dir]]);
      expect(ledger.record.mock.calls).toEqual([[recordedAs(B2)]]);
    });

    it('applies the first batch on an empty ledger', async () => {
      const { runner, manualImport } = await makeService();

      const outcome = await runner.apply({ dataDir: DATA, batch: B1.name });

      expect(outcome.applied).toEqual([B1.name]);
      expect(manualImport.run.mock.calls).toEqual([[B1.dir]]);
    });

    it('skips a batch that is already recorded', async () => {
      const { runner, ledger, manualImport } = await makeService({
        recorded: [recordedAs(B1)],
      });

      expect(await runner.apply({ dataDir: DATA, batch: B1.name })).toEqual({
        applied: [],
        skipped: [B1.name],
        failed: undefined,
        imported: 0,
      });
      expect(manualImport.run).not.toHaveBeenCalled();
      expect(ledger.record).not.toHaveBeenCalled();
    });

    it('rejects an unknown batch name', async () => {
      const { runner, manualImport } = await makeService();

      await expect(
        runner.apply({ dataDir: DATA, batch: '007-typo' }),
      ).rejects.toThrow('There is no batch named "007-typo" in data/batches.');
      expect(manualImport.run).not.toHaveBeenCalled();
    });

    it('refuses while a lower-numbered batch is unrecorded, naming each one', async () => {
      const { runner, manualImport, ledger } = await makeService();

      const attempt = runner.apply({ dataDir: DATA, batch: B3.name });

      await expect(attempt).rejects.toThrow(
        /001-a, 002-b.*Apply them first.*mark-applied/s,
      );
      expect(manualImport.run).not.toHaveBeenCalled();
      expect(ledger.record).not.toHaveBeenCalled();
    });

    it('names only the lower-numbered batches that are unrecorded', async () => {
      const { runner } = await makeService({ recorded: [recordedAs(B1)] });

      const attempt = runner.apply({ dataDir: DATA, batch: B3.name });

      await expect(attempt).rejects.toThrow(/002-b/);
      await expect(attempt).rejects.not.toThrow(/001-a/);
    });

    it('leaves a failing batch unrecorded', async () => {
      const errors = [{ item: {}, message: 'Cannot import x.' }];
      const { runner, ledger } = await makeService({
        results: { [B1.dir]: { success: false, imported: 2, errors } },
      });

      expect(await runner.apply({ dataDir: DATA, batch: B1.name })).toEqual({
        applied: [],
        skipped: [],
        failed: { name: B1.name, errors },
        imported: 2,
      });
      expect(ledger.record).not.toHaveBeenCalled();
    });
  });

  it.each([[undefined], [B2.name]])(
    'refuses to run (batch %s) when a recorded batch has changed',
    async (batchName) => {
      const { runner, manualImport } = await makeService({
        recorded: [{ name: B1.name, contentHash: 'stale' }],
      });

      await expect(
        runner.apply({ dataDir: DATA, batch: batchName }),
      ).rejects.toThrow(/001-a has changed.*new batch/);
      expect(manualImport.run).not.toHaveBeenCalled();
    },
  );

  it.each([[undefined], [B1.name]])(
    'refuses to run (batch %s) when a recorded batch no longer exists',
    async (batchName) => {
      const { runner, manualImport } = await makeService({
        recorded: [recordedAs(B1), { name: '009-gone', contentHash: 'x' }],
      });

      await expect(
        runner.apply({ dataDir: DATA, batch: batchName }),
      ).rejects.toThrow(/009-gone.*no longer exists/);
      expect(manualImport.run).not.toHaveBeenCalled();
    },
  );
});

describe('BatchRunnerService.markApplied', () => {
  it('records the named batches without importing them', async () => {
    const { runner, ledger, manualImport } = await makeService();

    expect(await runner.markApplied([B1.name, B2.name], DATA)).toEqual({
      recorded: [B1.name, B2.name],
      alreadyRecorded: [],
    });
    expect(ledger.record.mock.calls).toEqual([
      [recordedAs(B1)],
      [recordedAs(B2)],
    ]);
    expect(manualImport.run).not.toHaveBeenCalled();
  });

  it('reports a batch already recorded with the same content', async () => {
    const { runner, ledger } = await makeService({
      recorded: [recordedAs(B1)],
    });

    expect(await runner.markApplied([B1.name, B1.name], DATA)).toEqual({
      recorded: [],
      alreadyRecorded: [B1.name],
    });
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('rejects an unknown batch before recording anything', async () => {
    const { runner, ledger } = await makeService();

    await expect(
      runner.markApplied([B1.name, '007-typo'], DATA),
    ).rejects.toThrow(/007-typo/);
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('rejects a recorded batch whose content has changed', async () => {
    const { runner, ledger } = await makeService({
      recorded: [{ name: B1.name, contentHash: 'stale' }],
    });

    await expect(runner.markApplied([B1.name], DATA)).rejects.toThrow(
      /001-a has changed/,
    );
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('needs at least one batch name', async () => {
    const { runner } = await makeService();

    await expect(runner.markApplied([], DATA)).rejects.toThrow(
      /at least one batch/,
    );
  });
});
