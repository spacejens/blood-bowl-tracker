import type { ImportError } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ManualDataReader } from '../data-file/manual-data-reader.service';
import { ManualImportService } from '../import/manual-import.service';
import { BatchCatalogService } from './batch-catalog.service';
import { BatchContentHashService } from './batch-content-hash.service';
import { BatchLedgerService } from './batch-ledger.service';
import type { BatchPhase, ManualBatch, RecordedBatch } from './manual-batch';

/** What one phase run did. */
export interface BatchRunOutcome {
  /** Batches imported without errors and recorded, in order. */
  applied: string[];
  /** Batches of the phase already recorded, so not imported. */
  skipped: string[];
  /**
   * The batch that imported with errors, left unrecorded; no later batch was
   * attempted, since later batches may depend on it. Rerunning is safe:
   * every write is an idempotent upsert.
   */
  failed: { name: string; errors: ImportError[] } | undefined;
  /** Records imported across every attempted batch. */
  imported: number;
}

/** What one mark-applied run did. */
export interface MarkAppliedOutcome {
  recorded: string[];
  alreadyRecorded: string[];
}

interface HashedBatch {
  batch: ManualBatch;
  contentHash: string;
}

@Injectable()
export class BatchRunnerService {
  constructor(
    private readonly catalog: BatchCatalogService,
    private readonly reader: ManualDataReader,
    private readonly hasher: BatchContentHashService,
    private readonly ledger: BatchLedgerService,
    private readonly manualImport: ManualImportService,
  ) {}

  /**
   * Apply, in number order, every batch of `phase` the ledger does not
   * record, recording each one only once it imported with zero errors.
   *
   * Before importing anything, every batch of both phases is checked against
   * the ledger: a recorded batch whose content hash changed, or that no
   * longer exists, is an error -- an applied batch is a historical record, so
   * a change belongs in a new batch. Both phases are checked because a
   * long-lived database only ever runs the after phase. The after phase also
   * refuses to run while a before batch is unrecorded: on a fresh database
   * the before phase (and the source importers) must run first, and on one
   * that already holds those batches they are recorded with mark-applied.
   */
  async runPhase(phase: BatchPhase, dataDir: string): Promise<BatchRunOutcome> {
    const batches = await this.hashAll(await this.catalog.discover(dataDir));
    const recorded = await this.recordedByName();
    this.assertRecordedExist(batches, recorded);
    this.assertRecordedUnchanged(batches, recorded);
    if (phase === 'after') {
      this.assertBeforePhaseRecorded(batches, recorded);
    }

    const outcome: BatchRunOutcome = {
      applied: [],
      skipped: [],
      failed: undefined,
      imported: 0,
    };
    for (const { batch, contentHash } of batches) {
      if (batch.phase !== phase) {
        continue;
      }
      if (recorded.has(batch.name)) {
        outcome.skipped.push(batch.name);
        continue;
      }
      const result = await this.manualImport.run(batch.dir);
      outcome.imported += result.imported;
      if (!result.success) {
        outcome.failed = { name: batch.name, errors: result.errors };
        return outcome;
      }
      await this.ledger.record({ name: batch.name, contentHash });
      outcome.applied.push(batch.name);
    }
    return outcome;
  }

  /**
   * Record the named batches as applied, with their current content hashes,
   * without importing them -- for a database that already holds their data.
   * Every name is checked (it must exist, and if already recorded its
   * content must be unchanged) before anything is recorded.
   */
  async markApplied(
    names: string[],
    dataDir: string,
  ): Promise<MarkAppliedOutcome> {
    if (names.length === 0) {
      throw new Error(
        'mark-applied needs at least one batch name, e.g. mark-applied 001-before-initial-sources.',
      );
    }
    const byName = new Map(
      (await this.catalog.discover(dataDir)).map((b) => [b.name, b]),
    );
    const named = [...new Set(names)].map((name) => {
      const batch = byName.get(name);
      if (batch === undefined) {
        throw new Error(`There is no batch named "${name}" in data/batches.`);
      }
      return batch;
    });
    const batches = await this.hashAll(named);
    const recorded = await this.recordedByName();
    this.assertRecordedUnchanged(batches, recorded);

    const outcome: MarkAppliedOutcome = { recorded: [], alreadyRecorded: [] };
    for (const { batch, contentHash } of batches) {
      if (recorded.has(batch.name)) {
        outcome.alreadyRecorded.push(batch.name);
        continue;
      }
      await this.ledger.record({ name: batch.name, contentHash });
      outcome.recorded.push(batch.name);
    }
    return outcome;
  }

  private async hashAll(batches: ManualBatch[]): Promise<HashedBatch[]> {
    const hashed: HashedBatch[] = [];
    for (const batch of batches) {
      const raw = await this.reader.readRaw(batch.dir);
      hashed.push({ batch, contentHash: this.hasher.hash(raw) });
    }
    return hashed;
  }

  private async recordedByName(): Promise<Map<string, RecordedBatch>> {
    return new Map((await this.ledger.list()).map((b) => [b.name, b]));
  }

  private assertRecordedExist(
    batches: HashedBatch[],
    recorded: Map<string, RecordedBatch>,
  ): void {
    const known = new Set(batches.map(({ batch }) => batch.name));
    for (const name of recorded.keys()) {
      if (!known.has(name)) {
        throw new Error(
          `Batch ${name} is recorded as applied but no longer exists in data/batches. An applied batch is a historical record: restore it rather than renaming or removing it.`,
        );
      }
    }
  }

  private assertRecordedUnchanged(
    batches: HashedBatch[],
    recorded: Map<string, RecordedBatch>,
  ): void {
    for (const { batch, contentHash } of batches) {
      const entry = recorded.get(batch.name);
      if (entry !== undefined && entry.contentHash !== contentHash) {
        throw new Error(
          `Batch ${batch.name} has changed since it was applied (recorded content hash ${entry.contentHash}, now ${contentHash}). An applied batch is a historical record: revert the change and put it in a new batch instead.`,
        );
      }
    }
  }

  private assertBeforePhaseRecorded(
    batches: HashedBatch[],
    recorded: Map<string, RecordedBatch>,
  ): void {
    const missing = batches
      .filter(
        ({ batch }) => batch.phase === 'before' && !recorded.has(batch.name),
      )
      .map(({ batch }) => batch.name);
    if (missing.length > 0) {
      throw new Error(
        `Before batch(es) ${missing.join(', ')} are not recorded as applied. On a fresh database run before-sources (then the BBL and TP importers) first; on a database that already holds them, record them with mark-applied.`,
      );
    }
  }
}
