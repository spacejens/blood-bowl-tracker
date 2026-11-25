export type { ManualBatch } from '@blood-bowl-tracker/manual-batch';

/** A batch the database's ledger records as applied. */
export interface RecordedBatch {
  name: string;
  contentHash: string;
}
