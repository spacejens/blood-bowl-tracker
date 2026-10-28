/// <reference types="node" />
import { join } from 'node:path';

import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BatchRunOutcome } from '../src/batches/batch-runner.service';
import type { ManualBatch } from '../src/batches/manual-batch';
import { testDatabaseUrl } from './e2e-database';
import type { ImporterStack } from './importer-stack.test-helpers';
import {
  historyCounts,
  snapshotGameData,
  startImporterStack,
  stopImporterStack,
} from './importer-stack.test-helpers';
import type { StandInOutcome } from './source-stand-in.test-helpers';
import { curatedPicks, runSourceStandIn } from './source-stand-in.test-helpers';

/**
 * Runs the importer sequence (`apply 001-initial-seed`, a BBL/TP stand-in,
 * a plain `apply`, then the batches after the stopping point by directory)
 * twice against one real Postgres, through the real api-server
 * served over HTTP and the real manual importer, and asserts that the
 * identical second run changes no row and adds no history row in any
 * game_data table. The second `apply 001-initial-seed` must apply nothing, and
 * `manual_import_batches` (a game_data table, so part of the snapshot) gains
 * no row on the second run.
 *
 * Covers: every curated data file in every batch as really authored (apart
 * from the position-availability race-era syncs, which fail in the harness and
 * are never exercised), so two files that disagree about a row show up as a
 * flip; the server-side semantics re-runs depend on (`renameExisting`, the
 * `insertOnly` syncs, the `reportedSppTotal` SPP sync); that a source
 * re-sending a raw spelling never changes a curated coach, competition,
 * skill, position, team or race name, not even between the manual
 * passes; and that a fresh run ends with TP's characteristics and
 * starting-skill attribute.
 *
 * Cannot cover: the real BBL and TP pipelines (HTML/JSON parsing, the
 * orchestration in their `main.ts`, the server-side `tpRosters`,
 * `tpMatches`, `tpCompetitions` and `tpOfficialTeams` imports), because their
 * source dumps are not in the repository; flips that originate in the source
 * data itself; and tables derived from match events. The tables race_eras,
 * positions_race_eras, era_rules_sets, matches, match_events, player_skills,
 * trophy_awards and competition_teams stay empty in the harness, so their
 * comparisons pass vacuously. Without BBL and TP,
 * batch 002 has entries that reference rows only they create; those fail with
 * recorded errors, so a plain apply stops there and the suite asserts the
 * errors are of the two known kinds and the same on both runs rather than
 * empty. Trophy awards in the later batches fail the same way and are
 * asserted the same way.
 */

const DATA = join(__dirname, '../data');

interface RunOutcome {
  seed: BatchRunOutcome;
  standIn: StandInOutcome;
  rest: BatchRunOutcome;
  /** The batches numbered above where the plain apply stopped. */
  later: ImportResult[];
}

/**
 * Without the real BBL and TP importers, a plain apply stops at its first
 * unrecorded batch (002 has entries that reference rows only they create)
 * and leaves it unrecorded. The batches numbered above it are run by
 * directory -- which records nothing -- so their content still takes part in
 * the double-run comparison.
 */
async function laterBatches(
  stack: ImporterStack,
  rest: BatchRunOutcome,
): Promise<ManualBatch[]> {
  const failed = rest.failed;
  if (failed === undefined) {
    return [];
  }
  const batches = await stack.catalog.discover(DATA);
  const stoppedAt = batches.find((batch) => batch.name === failed.name);
  return batches.filter(
    (batch) => stoppedAt !== undefined && batch.number > stoppedAt.number,
  );
}

async function runSequence(stack: ImporterStack): Promise<RunOutcome> {
  const seed = await stack.batches.apply({
    dataDir: DATA,
    batch: '001-initial-seed',
  });
  const standIn = await runSourceStandIn(stack.client, stack.db);
  const rest = await stack.batches.apply({ dataDir: DATA });
  const later: ImportResult[] = [];
  for (const batch of await laterBatches(stack, rest)) {
    later.push(await stack.manual.run(batch.dir));
  }
  return { seed, standIn, rest, later };
}

const messages = (errors: ImportError[]) =>
  errors.map((error) => error.message).sort();

const recordedBatches = (snapshot: Record<string, string[]>) =>
  (snapshot.manual_import_batches ?? []).map(
    (row) => (JSON.parse(row) as { name: string }).name,
  );

describe('the importer sequence, run twice (real Postgres, real api-server)', () => {
  let stack: ImporterStack;
  let first: RunOutcome;
  let afterFirst: Record<string, string[]>;
  let second: RunOutcome;
  let afterSecond: Record<string, string[]>;

  beforeAll(async () => {
    stack = await startImporterStack(testDatabaseUrl());
    first = await runSequence(stack);
    afterFirst = await snapshotGameData(stack.db);
    second = await runSequence(stack);
    afterSecond = await snapshotGameData(stack.db);
  });

  afterAll(async () => {
    if (stack) {
      await stopImporterStack(stack);
    }
  });

  it('applies and records batch 001 on the first run, and skips it on the second', () => {
    expect(first.seed).toMatchObject({
      applied: ['001-initial-seed'],
      skipped: [],
      failed: undefined,
    });
    expect(second.seed).toEqual({
      applied: [],
      skipped: ['001-initial-seed'],
      failed: undefined,
      imported: 0,
    });
  });

  it('stops a plain apply at batch 002 with the same known errors both times', () => {
    // Entries that reference rows only the real BBL/TP importers create fail
    // here; what matters is that a re-run behaves identically, and that the
    // failures are the known kinds: race-era syncs that need BBL race ids,
    // race-era syncs naming a race/era pair whose race_eras row only the
    // source importers create, and a trophy award that needs a TP id.
    for (const run of [first, second]) {
      expect(run.rest.applied).toEqual([]);
      expect(run.rest.failed?.name).toBe('002-initial-cleanup');
    }
    const firstMessages = messages(first.rest.failed?.errors ?? []);
    expect(firstMessages.length).toBeGreaterThan(0);
    expect(messages(second.rest.failed?.errors ?? [])).toEqual(firstMessages);
    for (const message of firstMessages) {
      expect(message).toMatch(
        /^(?:Cannot (?:sync race-eras for position ".+": could not resolve reference tloeg\.bbleague\.se\|\d+|import award of trophy ".+": could not resolve reference tourplay\.net\|\d+)\.|Failed to sync race eras for position \d+: Race \d+ is not available in era \d+ \(no race_eras row\), so position \d+ cannot be made available there)$/,
      );
    }
  });

  it('imports the batches after the stopping point with only the known errors, both times', () => {
    // A later batch may also name trophy awards, whose players only the real
    // BBL/TP importers create; those are the only errors allowed, and a
    // re-run must report the same ones.
    expect(second.later).toHaveLength(first.later.length);
    first.later.forEach((result, index) => {
      const firstMessages = messages(result.errors);
      expect(messages(second.later[index]?.errors ?? [])).toEqual(
        firstMessages,
      );
      for (const message of firstMessages) {
        expect(message).toMatch(
          /^Cannot import award of trophy ".+": could not resolve reference (?:tloeg\.bbleague\.se|tourplay\.net)\|\d+\.$/,
        );
      }
    });
  });

  it('records only the batches that applied cleanly, and nothing more on the second run', () => {
    expect(recordedBatches(afterFirst)).toEqual(['001-initial-seed']);
    expect(recordedBatches(afterSecond)).toEqual(['001-initial-seed']);
  });

  it('never lets a source re-run change a curated name between the manual passes', () => {
    const expected = Object.fromEntries(
      Object.entries(curatedPicks()).map(([kind, ref]) => [kind, ref.name]),
    );
    expect(first.standIn.namesAfterRawUpsert).toEqual(expected);
    expect(second.standIn.namesAfterRawUpsert).toEqual(expected);
  });

  it("ends a fresh run with TP's characteristics, skill spelling and corrected SPP total", () => {
    expect(first.standIn).toMatchObject({
      agility: 3,
      attributeValue: 'tp',
      sppTotal: 12,
    });
  });

  it('adds no history row on the identical second run', () => {
    expect(historyCounts(afterSecond)).toEqual(historyCounts(afterFirst));
  });

  it('changes no row on the identical second run', () => {
    for (const table of Object.keys(afterFirst)) {
      expect(afterSecond[table], table).toEqual(afterFirst[table]);
    }
  });
});
