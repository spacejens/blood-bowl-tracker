import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import JSON5 from 'json5';

import type { ManualDataFile } from './manual-data-file.schema';
import { ManualDataFileSchema } from './manual-data-file.schema';

const DATA_ROOT = join(__dirname, '../../data');

/** Batch 001: the curated data applied before the source importers. */
export const BATCH_001 = 'batches/001-before-initial-sources';
/** Batch 002: the curated data applied after the source importers. */
export const BATCH_002 = 'batches/002-after-initial-sources';

/** Every batch directory, as `batches/<name>`, in name order. */
export function listBatches(): string[] {
  return readdirSync(join(DATA_ROOT, 'batches'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `batches/${entry.name}`)
    .sort();
}

/** The `.json5` files of one batch directory, in filename order. */
function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json5'))
    .sort();
}

/**
 * Parses and validates every curated JSON5 file in one batch directory,
 * pooling the sections exactly as ManualDataReader does at runtime. These
 * tests guard the real curated data -- nothing else in the suite reads it --
 * so a typo in a group name or an invalid entry shape fails here rather than
 * halfway through a live import run.
 */
export function readBatch(batch: string): ManualDataFile {
  const dir = join(DATA_ROOT, batch);
  const pooled = ManualDataFileSchema.parse({});
  for (const name of jsonFiles(dir)) {
    const parsed = ManualDataFileSchema.parse(
      JSON5.parse(readFileSync(join(dir, name), 'utf8')),
    );
    for (const key of Object.keys(pooled) as (keyof ManualDataFile)[]) {
      (pooled[key] as unknown[]).push(...(parsed[key] as unknown[]));
    }
  }
  return pooled;
}

/**
 * Parses and validates a single curated JSON5 file in isolation, without
 * pooling it against its sibling files in the same batch directory. Use this
 * instead of `readBatch` when a test must assert something about exactly one
 * file's own declarations -- `readBatch` pools `externalSystems` (and every
 * other section) across every file in the directory, so an assertion against
 * `readBatch(...).externalSystems` can pass even when the file under test
 * declares nothing at all, as long as some sibling file does.
 */
export function readFile(batch: string, name: string): ManualDataFile {
  return ManualDataFileSchema.parse(
    JSON5.parse(readFileSync(join(DATA_ROOT, batch, name), 'utf8')),
  );
}
