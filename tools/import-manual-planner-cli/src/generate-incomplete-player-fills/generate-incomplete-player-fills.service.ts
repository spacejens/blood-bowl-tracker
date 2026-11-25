import type { WriteFileResult } from '@blood-bowl-tracker/cli-shared';
import { WriteFileService } from '@blood-bowl-tracker/cli-shared';
import { LastingReductionService } from '@blood-bowl-tracker/game-rules';
import { Injectable } from '@nestjs/common';

import { TpFeedHistoryStoreService } from '../read-tp-feed-history/tp-feed-history-store.service';
import type { TpRosterSnapshots } from '../read-tp-roster-snapshots/tp-roster-snapshots.schema';
import { TpRosterSnapshotsStoreService } from '../read-tp-roster-snapshots/tp-roster-snapshots-store.service';
import {
  CHARACTERISTIC_KEYS,
  CHARACTERISTIC_NAME_BY_KEY,
} from './characteristic-keys';
import type {
  FillEntry,
  FillReport,
  LastingInjuryRepairCandidate,
  LastingInjuryRepairEntry,
  OngoingCompetitionSummary,
  SkipTally,
} from './fill-plan.types';
import { FillSectionRendererService } from './fill-section-renderer.service';
import { IncompletePlayerFillPlannerService } from './incomplete-player-fill-planner.service';
import { IncompletePlayerFillQueriesService } from './incomplete-player-fill-queries.service';
import {
  ScratchCompletenessService,
  type ScratchCompletenessSplit,
} from './scratch-completeness.service';

export interface GenerateIncompletePlayerFillsInput {
  /** Repo-relative path to write the batch file to; printed when absent. */
  readonly out?: string;
  /**
   * The TP feed channel whose saved `reports.json` (read-tp-feed-history)
   * proves advancements; absent leaves that stage off.
   */
  readonly feedChannel?: string;
  /**
   * Read the roster snapshots `read-tp-roster-snapshots` saved, to prove
   * the advancements of players the feed does not name; absent leaves
   * that stage off.
   */
  readonly snapshots?: true;
}

export interface GenerateIncompletePlayerFillsReport extends FillReport {
  /**
   * The competitions treated as ongoing (a `tourplay.net` id and no end
   * date), each with its team count; their teams' players are skipped.
   */
  readonly ongoingCompetitions: readonly OngoingCompetitionSummary[];
  /**
   * The players listed in the file's `lastingInjuryRepairs` section: those
   * a database built from scratch can apply.
   */
  readonly lastingInjuryRepairs: number;
  /**
   * The players selected for a repair but left out of that section because
   * their stored line shows no reduction for the server to record.
   */
  readonly lastingInjuryRepairsNothingToRecord: number;
  /**
   * The repairs left out because a database built from scratch would still
   * have the player incomplete and refuse them, with their TP ids.
   */
  readonly lastingInjuryRepairsScratchIncomplete: SkipTally;
}

interface ScratchSafeRepairsInput {
  repairs: LastingInjuryRepairEntry[];
  snapshots: TpRosterSnapshots | null;
  entries: readonly FillEntry[];
  out: string | undefined;
}

export interface GenerateIncompletePlayerFillsResult {
  readonly report: GenerateIncompletePlayerFillsReport;
  /** The rendered batch file, when no path was given. */
  readonly section?: string;
  /** What was written, when a path was given. */
  readonly written?: WriteFileResult;
}

/**
 * `generate-incomplete-player-fills`: reads production read-only, plans a
 * fill for every incomplete TP player whose data can be proven (optionally
 * from the saved TP feed reports and roster snapshots), lists the complete
 * TP players whose stored line shows a lasting stat reduction the server
 * would record, and prints or writes the batch file. Its report tells which
 * competitions were treated as ongoing, who was filled by which proof, who
 * was skipped and why, and how many repairs are listed, left out with
 * nothing to record, or left out because a database built from scratch
 * would still have the player incomplete.
 */
@Injectable()
export class GenerateIncompletePlayerFillsService {
  constructor(
    private readonly queries: IncompletePlayerFillQueriesService,
    private readonly planner: IncompletePlayerFillPlannerService,
    private readonly renderer: FillSectionRendererService,
    private readonly writeFile: WriteFileService,
    private readonly feedHistory: TpFeedHistoryStoreService,
    private readonly lastingReduction: LastingReductionService,
    private readonly snapshotStore: TpRosterSnapshotsStoreService,
    private readonly scratch: ScratchCompletenessService,
  ) {}

  async run(
    input: GenerateIncompletePlayerFillsInput,
  ): Promise<GenerateIncompletePlayerFillsResult> {
    // Read first, so missing evidence stops the run before any production query.
    const feed =
      input.feedChannel === undefined
        ? null
        : await this.feedHistory.readReports(input.feedChannel);
    const snapshots =
      input.snapshots === true
        ? await this.snapshotStore.readSnapshots()
        : null;
    const rows = await this.queries.load();
    const plan = this.planner.plan({ ...rows, feed, snapshots });
    const candidates = await this.queries.loadLastingInjuryRepairCandidates();
    const selected = this.repairable(candidates);
    const { safe, unsafe } = await this.scratchSafeRepairs({
      repairs: selected,
      snapshots,
      entries: plan.entries,
      out: input.out,
    });
    const report: GenerateIncompletePlayerFillsReport = {
      ...plan.report,
      ongoingCompetitions: rows.ongoingCompetitions,
      lastingInjuryRepairs: safe.length,
      lastingInjuryRepairsNothingToRecord: candidates.length - selected.length,
      lastingInjuryRepairsScratchIncomplete: {
        count: unsafe.length,
        players: unsafe,
      },
    };
    const section = this.renderer.render(plan.entries, safe);
    if (input.out === undefined) {
      return { report, section };
    }
    if (plan.entries.length === 0 && safe.length === 0) {
      throw new Error(
        'No incomplete player is eligible for a fill and no player needs ' +
          'his lasting reductions recorded; nothing written. ' +
          `Report: ${JSON.stringify(report)}`,
      );
    }
    const written = await this.writeFile.run(input.out, section);
    return { report, written };
  }

  /**
   * The selected repairs a database built from scratch can apply. Telling
   * them apart needs the roster copies `read-tp-roster-snapshots` saves, so
   * a run that selects a repair without `--snapshots` stops.
   */
  private async scratchSafeRepairs(
    input: ScratchSafeRepairsInput,
  ): Promise<ScratchCompletenessSplit> {
    if (input.repairs.length === 0) {
      return { safe: [], unsafe: [] };
    }
    if (input.snapshots === null) {
      throw new Error(
        `${input.repairs.length} lasting-injury repair(s) selected, and ` +
          'listing them needs --snapshots: the roster copies ' +
          'read-tp-roster-snapshots saves tell which players a database ' +
          'built from scratch has complete. Run read-tp-roster-snapshots, ' +
          'then pass --snapshots.',
      );
    }
    return this.scratch.split({
      repairs: input.repairs,
      rosterCopies: input.snapshots.rosterCopies,
      shown: Object.keys(input.snapshots.players),
      evidenceComplete: input.snapshots.unreadable.length === 0,
      runFills: input.entries,
      out: input.out,
    });
  }

  /**
   * The candidates for whom the server's players.recordLastingReductions
   * derives at least one reduction, so no listed repair is a no-op. Without
   * a rules set or a start line every count is 0.
   */
  private repairable(
    candidates: readonly LastingInjuryRepairCandidate[],
  ): LastingInjuryRepairEntry[] {
    return candidates
      .filter(({ context, line, increases }) => {
        if (context === null || context.baseline === null) {
          return false;
        }
        const { baseline, formats } = context;
        return CHARACTERISTIC_KEYS.some(
          (key) =>
            this.lastingReduction.reduction({
              characteristic: CHARACTERISTIC_NAME_BY_KEY[key],
              format: formats[key],
              value: line[key],
              start: baseline[key],
              increases: increases.filter((k) => k === key).length,
            }) > 0,
        );
      })
      .map(({ player }) => ({ player }));
  }
}
