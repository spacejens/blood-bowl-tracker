/// <reference types="node" />
import { join } from 'node:path';

import type { ImportResult } from '@blood-bowl-tracker/import';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
 * Runs the importer sequence (manual before phase, a BBL/TP stand-in, manual
 * after phase) twice against one real Postgres, through the real api-server
 * served over HTTP and the real manual importer, and asserts that the
 * identical second run changes no row and adds no history row in any
 * game_data table.
 *
 * Covers: every curated data file in both phases as really authored (apart
 * from the position-availability race-era syncs, which fail in the harness and
 * are never exercised), so two files that disagree about a row show up as a
 * flip; the server-side semantics re-runs depend on (`renameExisting`, the
 * `insertOnly` syncs, the `reportedTotal` SPP sync); that a source
 * re-sending a raw spelling never changes a curated coach, competition,
 * skill, position, team or race name, not even between the two manual
 * phases; and that a fresh run ends with TP's characteristics and
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
 * the after phase has entries that reference rows only they create; those
 * fail with recorded errors, so the suite asserts the after-phase errors are
 * of the two known kinds and the same on both runs rather than empty.
 */

const DATA = join(__dirname, '../data');

interface RunOutcome {
  before: ImportResult;
  standIn: StandInOutcome;
  after: ImportResult;
}

async function runSequence(stack: ImporterStack): Promise<RunOutcome> {
  const before = await stack.manual.run(join(DATA, 'before-other-importers'));
  const standIn = await runSourceStandIn(stack.client, stack.db);
  const after = await stack.manual.run(join(DATA, 'after-other-importers'));
  return { before, standIn, after };
}

const messages = (result: ImportResult) =>
  result.errors.map((error) => error.message).sort();

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

  it('imports the before phase without errors, both times', () => {
    expect(messages(first.before)).toEqual([]);
    expect(messages(second.before)).toEqual([]);
  });

  it('records the same after-phase errors both times', () => {
    // Entries that reference rows only the real BBL/TP importers create fail
    // here; what matters is that a re-run behaves identically, and that the
    // failures are the two known kinds: race-era syncs that need BBL race ids
    // and a trophy award that needs a TP id.
    expect(messages(second.after)).toEqual(messages(first.after));
    for (const message of messages(first.after)) {
      expect(message).toMatch(
        /^Cannot (?:sync race-eras for position ".+": could not resolve reference tloeg\.bbleague\.se\|\d+|import award of trophy ".+": could not resolve reference tourplay\.net\|\d+)\.$/,
      );
    }
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
