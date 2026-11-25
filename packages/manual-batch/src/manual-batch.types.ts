/** The directory under a manual-import data directory that holds the batches. */
export const MANUAL_BATCHES_DIR_NAME = 'batches';

/** One `NNN-<slug>` batch directory. */
export interface ManualBatch {
  name: string;
  number: number;
  dir: string;
}
