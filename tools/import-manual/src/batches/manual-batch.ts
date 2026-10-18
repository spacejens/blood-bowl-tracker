/** Whether a batch runs before or after the BBL and TP source importers. */
export type BatchPhase = 'before' | 'after';

/** One `data/batches/NNN-<phase>-<slug>/` directory. */
export interface ManualBatch {
  /** The directory name, e.g. "002-after-initial-sources". */
  name: string;
  /** The leading three-digit number, which orders batches. */
  number: number;
  phase: BatchPhase;
  /** Absolute path of the directory. */
  dir: string;
}

/** A batch the database's ledger records as applied. */
export interface RecordedBatch {
  name: string;
  contentHash: string;
}
