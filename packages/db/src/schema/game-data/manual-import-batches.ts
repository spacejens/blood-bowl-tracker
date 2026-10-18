import { serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { gameData } from './pg-schema';

/**
 * The batches of tools/import-manual's curated data (its
 * `data/batches/NNN-<phase>-<slug>/` directories) applied to this database,
 * one row per batch. A batch is applied once and then kept as a historical
 * record; the importer skips a recorded batch and refuses to run when a
 * recorded batch's content no longer matches `content_hash`, so a change to
 * curated data always goes into a new batch.
 *
 * Kept in `game_data`, beside the data it describes, so a backup restore
 * brings its ledger with it and a schema reset empties both together.
 *
 * `content_hash` is the SHA-256 hex digest of the batch's JSON5-parsed
 * content, computed by the importer (see BatchContentHashService), so
 * comment and formatting edits do not change it.
 */
const manualImportBatchesTable = historyTrackedTable({
  schema: gameData,
  name: 'manual_import_batches',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
});

export const manualImportBatches = manualImportBatchesTable.table;
export const manualImportBatchesHistory = manualImportBatchesTable.historyTable;

export type ManualImportBatch = typeof manualImportBatches.$inferSelect;
export type NewManualImportBatch = typeof manualImportBatches.$inferInsert;
