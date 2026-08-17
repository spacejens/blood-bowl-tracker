import type { ImportError } from '@blood-bowl-tracker/import';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';

/**
 * Everything an entity processor needs for one import run: the pooled data,
 * the external-system name -> id map built by the bootstrap step, and the
 * shared error collector.
 *
 * There is deliberately no run-scoped external-id -> entity-id map: every
 * cross-reference is resolved against the database through the API, so a
 * reference works regardless of which run, phase or tool created its target.
 */
export interface ProcessContext {
  data: ManualDataFile;
  systemIds: ReadonlyMap<string, number>;
  errors: ImportError[];
}
