import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import JSON5 from 'json5';

import type { ManualDataFile } from './manual-data-file.schema';
import { ManualDataFileSchema } from './manual-data-file.schema';

const DATA_ROOT = join(__dirname, '../../data');

/** Batch 001: the curated data the first import starts from, applied before the BBL and TP importers. */
export const BATCH_001 = 'batches/001-initial-seed';
/** Batch 002: the curated data applied once the BBL and TP importers have run. */
export const BATCH_002 = 'batches/002-initial-cleanup';

/** Batch 003: every curated name restated once, for a long-lived database. */
export const BATCH_003 = 'batches/003-reset-curated-names';

/** Batch 004: the SPP cost of each advancement for every rules set. */
export const BATCH_004 = 'batches/004-advancement-costs';

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

/**
 * One batch's files exactly as JSON5 parses them -- no validation, no schema
 * defaults -- pooled by section in filename order. For asserting what a file
 * actually spells out, which `readBatch`'s defaulted result cannot show.
 */
export function readRawBatch(
  batch: string,
): Record<string, Record<string, unknown>[]> {
  const dir = join(DATA_ROOT, batch);
  const pooled: Record<string, Record<string, unknown>[]> = {};
  for (const name of jsonFiles(dir)) {
    const parsed = JSON5.parse<Record<string, Record<string, unknown>[]>>(
      readFileSync(join(dir, name), 'utf8'),
    );
    for (const [section, entries] of Object.entries(parsed)) {
      (pooled[section] ??= []).push(...entries);
    }
  }
  return pooled;
}

/**
 * Every external-system name one raw batch spells out: each
 * `externalSystems` entry's `name`, and the `system` of every
 * `{ system, id }` pair at any depth (external ids and cross-references
 * alike).
 */
export function externalSystemNamesIn(
  raw: Record<string, Record<string, unknown>[]>,
): Set<string> {
  const names = new Set<string>();
  for (const entry of raw.externalSystems ?? []) {
    if (typeof entry.name === 'string') {
      names.add(entry.name);
    }
  }
  collectSystems(raw, names);
  return names;
}

function collectSystems(value: unknown, names: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSystems(item, names);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'system' && typeof child === 'string') {
      names.add(child);
    } else {
      collectSystems(child, names);
    }
  }
}
