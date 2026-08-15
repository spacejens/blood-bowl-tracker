import type { ImportError } from '@blood-bowl-tracker/import';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import type { ExternalIdMap } from './external-id-map';

/**
 * Everything an entity processor needs for one import run: the pooled data, the
 * external-system name -> id map built by the bootstrap step, the growing
 * external-id -> entity-id map, and the shared error collector.
 */
export interface ProcessContext {
  data: ManualDataFile;
  systemIds: ReadonlyMap<string, number>;
  idMap: ExternalIdMap;
  errors: ImportError[];
}
