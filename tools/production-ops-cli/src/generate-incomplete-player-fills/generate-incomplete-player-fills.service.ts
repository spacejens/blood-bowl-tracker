import type { WriteFileResult } from '@blood-bowl-tracker/cli-shared';
import { WriteFileService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import { TpFeedHistoryStoreService } from '../read-tp-feed-history/tp-feed-history-store.service';
import { TpRosterSnapshotsStoreService } from '../read-tp-roster-snapshots/tp-roster-snapshots-store.service';
import type { FillReport, OngoingCompetitionSummary } from './fill-plan.types';
import { FillSectionRendererService } from './fill-section-renderer.service';
import { IncompletePlayerFillPlannerService } from './incomplete-player-fill-planner.service';
import { IncompletePlayerFillQueriesService } from './incomplete-player-fill-queries.service';
import { LastingInjuryRepairSelectorService } from './lasting-injury-repair-selector.service';

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
  /** The players listed in the file's `lastingInjuryRepairs` section. */
  readonly lastingInjuryRepairs: number;
  /**
   * The players selected for a repair but left out of that section because
   * their stored line shows no reduction for the server to record.
   */
  readonly lastingInjuryRepairsNothingToRecord: number;
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
 * would record, and prints or writes the batch file with a report of which
 * competitions were treated as ongoing, who was filled by which proof, who was skipped and why, and how many repairs are
 * listed or left out with nothing to record.
 */
@Injectable()
export class GenerateIncompletePlayerFillsService {
  constructor(
    private readonly queries: IncompletePlayerFillQueriesService,
    private readonly planner: IncompletePlayerFillPlannerService,
    private readonly renderer: FillSectionRendererService,
    private readonly writeFile: WriteFileService,
    private readonly feedHistory: TpFeedHistoryStoreService,
    private readonly repairSelector: LastingInjuryRepairSelectorService,
    private readonly snapshotStore: TpRosterSnapshotsStoreService,
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
    const repairs = this.repairSelector.select(candidates);
    const report: GenerateIncompletePlayerFillsReport = {
      ...plan.report,
      ongoingCompetitions: rows.ongoingCompetitions,
      lastingInjuryRepairs: repairs.length,
      lastingInjuryRepairsNothingToRecord: candidates.length - repairs.length,
    };
    const section = this.renderer.render(plan.entries, repairs);
    if (input.out === undefined) {
      return { report, section };
    }
    if (plan.entries.length === 0 && repairs.length === 0) {
      throw new Error(
        'No incomplete player is eligible for a fill and no player needs ' +
          'his lasting reductions recorded; nothing written. ' +
          `Report: ${JSON.stringify(report)}`,
      );
    }
    const written = await this.writeFile.run(input.out, section);
    return { report, written };
  }
}
