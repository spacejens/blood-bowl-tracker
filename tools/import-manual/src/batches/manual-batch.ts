/** One `data/batches/NNN-<slug>/` directory. */
export interface ManualBatch {
  /** The directory name, e.g. "002-initial-cleanup". */
  name: string;
  /** The leading three-digit number, which orders batches. */
  number: number;
  /** Absolute path of the directory. */
  dir: string;
}

/** A batch the database's ledger records as applied. */
export interface RecordedBatch {
  name: string;
  contentHash: string;
}
