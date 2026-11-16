import type { WriteFileResult } from '@blood-bowl-tracker/cli-shared';
import { WriteFileService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import type { FillReport } from './fill-plan.types';
import { FillSectionRendererService } from './fill-section-renderer.service';
import { IncompletePlayerFillPlannerService } from './incomplete-player-fill-planner.service';
import { IncompletePlayerFillQueriesService } from './incomplete-player-fill-queries.service';

export interface GenerateIncompletePlayerFillsInput {
  /** Repo-relative path to write the batch file to; printed when absent. */
  readonly out?: string;
}

export interface GenerateIncompletePlayerFillsResult {
  readonly report: FillReport;
  /** The rendered batch file, when no path was given. */
  readonly section?: string;
  /** What was written, when a path was given. */
  readonly written?: WriteFileResult;
}

/**
 * `generate-incomplete-player-fills`: reads production read-only, plans a
 * fill for every incomplete TP player too low on SPP to have advanced, and
 * prints or writes the batch file with a report of who was skipped and why.
 */
@Injectable()
export class GenerateIncompletePlayerFillsService {
  constructor(
    private readonly queries: IncompletePlayerFillQueriesService,
    private readonly planner: IncompletePlayerFillPlannerService,
    private readonly renderer: FillSectionRendererService,
    private readonly writeFile: WriteFileService,
  ) {}

  async run(
    input: GenerateIncompletePlayerFillsInput,
  ): Promise<GenerateIncompletePlayerFillsResult> {
    const plan = this.planner.plan({
      ...(await this.queries.load()),
      feed: null,
    });
    const section = this.renderer.render(plan.entries);
    if (input.out === undefined) {
      return { report: plan.report, section };
    }
    if (plan.entries.length === 0) {
      throw new Error(
        'No incomplete player is eligible for a fill; nothing written. ' +
          `Report: ${JSON.stringify(plan.report)}`,
      );
    }
    const written = await this.writeFile.run(input.out, section);
    return { report: plan.report, written };
  }
}
