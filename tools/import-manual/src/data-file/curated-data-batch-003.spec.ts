import { describe, expect, it } from 'vitest';

import {
  BATCH_001,
  BATCH_002,
  BATCH_003,
  readBatch,
  readRawBatch,
} from './curated-data.test-helpers';
import type { ExternalRef } from './manual-data-file.schema';

const KINDS = [
  'coaches',
  'competitions',
  'positions',
  'races',
  'skills',
  'teams',
] as const;
type Kind = (typeof KINDS)[number];

interface NamedEntry {
  name?: string;
  externalIds: ExternalRef[];
}

const key = (ref: ExternalRef) => `${ref.system}|${ref.id}`;

const entriesOf = (batch: string, kind: Kind): NamedEntry[] =>
  readBatch(batch)[kind];

/** Every named batch 001/002 entry of a kind, in the order a fresh import applies them. */
const curated = (kind: Kind): NamedEntry[] =>
  [...entriesOf(BATCH_001, kind), ...entriesOf(BATCH_002, kind)].filter(
    (entry) => entry.name !== undefined,
  );

const shares = (a: NamedEntry, b: NamedEntry): boolean => {
  const ids = new Set(a.externalIds.map(key));
  return b.externalIds.some((ref) => ids.has(key(ref)));
};

describe('batch 003 (restated curated names)', () => {
  it('holds only the six restated sections and their external systems', () => {
    expect(Object.keys(readRawBatch(BATCH_003)).sort()).toEqual([
      'coaches',
      'competitions',
      'externalSystems',
      'positions',
      'races',
      'skills',
      'teams',
    ]);
  });

  it.each(KINDS)('restates nothing but name and externalIds for %s', (kind) => {
    for (const entry of readRawBatch(BATCH_003)[kind] ?? []) {
      expect(Object.keys(entry).sort()).toEqual(['externalIds', 'name']);
    }
  });

  it.each(KINDS)(
    'restates the name a fresh import ends with for %s',
    (kind) => {
      const earlier = curated(kind);
      for (const entry of entriesOf(BATCH_003, kind)) {
        const last = earlier.filter((e) => shares(e, entry)).at(-1);
        expect(
          last,
          `${kind} "${entry.name}" restates no curated entry`,
        ).toBeDefined();
        expect(entry.name, JSON.stringify(entry.externalIds)).toBe(last?.name);
      }
    },
  );

  it.each(KINDS)(
    'restates every curated %s, with all its external ids',
    (kind) => {
      const restated = entriesOf(BATCH_003, kind);
      const ids = new Set(restated.flatMap((e) => e.externalIds.map(key)));
      for (const entry of curated(kind)) {
        for (const ref of entry.externalIds) {
          expect(ids.has(key(ref)), `${kind} "${entry.name}" ${key(ref)}`).toBe(
            true,
          );
        }
      }
    },
  );

  it.each(KINDS)('restates each %s row once', (kind) => {
    const seen = new Set<string>();
    for (const entry of entriesOf(BATCH_003, kind)) {
      for (const ref of entry.externalIds) {
        expect(seen.has(key(ref)), key(ref)).toBe(false);
        seen.add(key(ref));
      }
    }
  });
});
