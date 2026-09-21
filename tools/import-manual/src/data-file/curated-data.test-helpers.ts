import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import JSON5 from 'json5';

import type { ManualDataFile } from './manual-data-file.schema';
import { ManualDataFileSchema } from './manual-data-file.schema';

const DATA_ROOT = join(__dirname, '../../data');

/**
 * Parses and validates every curated JSON5 file in one phase directory,
 * pooling the sections exactly as ManualDataReader does at runtime. These
 * tests guard the real curated data -- nothing else in the suite reads it --
 * so a typo in a group name or an invalid entry shape fails here rather than
 * halfway through a live import run.
 */
export function readPhase(phase: string): ManualDataFile {
  const dir = join(DATA_ROOT, phase);
  const files = readdirSync(dir).filter((name) => name.endsWith('.json5'));
  const pooled = ManualDataFileSchema.parse({});
  for (const name of files) {
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
 * pooling it against its sibling files in the same phase directory. Use this
 * instead of `readPhase` when a test must assert something about exactly one
 * file's own declarations -- `readPhase` pools `externalSystems` (and every
 * other section) across every file in the directory, so an assertion against
 * `readPhase(...).externalSystems` can pass even when the file under test
 * declares nothing at all, as long as some sibling file does.
 */
export function readFile(phase: string, name: string): ManualDataFile {
  return ManualDataFileSchema.parse(
    JSON5.parse(readFileSync(join(DATA_ROOT, phase, name), 'utf8')),
  );
}
