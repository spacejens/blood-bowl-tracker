import {
  ChildProcessService,
  GitRootsService,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { CheckDependencyDashboardService } from './check-dependency-dashboard/check-dependency-dashboard.service';
import { CheckDriftService } from './check-drift/check-drift.service';
import { DriftDiffRedactionService } from './check-drift/drift-diff-redaction.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { DiffHunkMembershipService } from './post-review-questions/diff-hunk-membership.service';
import { PostReviewQuestionsService } from './post-review-questions/post-review-questions.service';
import { PostReviewQuestionsArgsService } from './post-review-questions/post-review-questions-args.service';
import { PullRequestReviewCommentsService } from './wait-for-pr-review/pull-request-review-comments.service';
import { WaitForPrReviewService } from './wait-for-pr-review/wait-for-pr-review.service';
import { WaitForPrReviewArgsService } from './wait-for-pr-review/wait-for-pr-review-args.service';
import { WaitForPrReviewFiltersService } from './wait-for-pr-review/wait-for-pr-review-filters.service';

describe('AppModule', () => {
  it('wires every dev-workflow subcommand service with its dependencies resolved', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(ProcessRunnerService)).toBeInstanceOf(
      ProcessRunnerService,
    );
    expect(moduleRef.get(GitRootsService)).toBeInstanceOf(GitRootsService);
    expect(moduleRef.get(CheckMainStrayService)).toBeInstanceOf(
      CheckMainStrayService,
    );
    expect(moduleRef.get(CheckDependencyDashboardService)).toBeInstanceOf(
      CheckDependencyDashboardService,
    );
    expect(moduleRef.get(CheckDriftService)).toBeInstanceOf(CheckDriftService);
    expect(moduleRef.get(DriftDiffRedactionService)).toBeInstanceOf(
      DriftDiffRedactionService,
    );
    expect(moduleRef.get(DiffHunkMembershipService)).toBeInstanceOf(
      DiffHunkMembershipService,
    );
    expect(moduleRef.get(PostReviewQuestionsService)).toBeInstanceOf(
      PostReviewQuestionsService,
    );
    expect(moduleRef.get(PostReviewQuestionsArgsService)).toBeInstanceOf(
      PostReviewQuestionsArgsService,
    );
    expect(moduleRef.get(WaitForPrReviewService)).toBeInstanceOf(
      WaitForPrReviewService,
    );
    expect(moduleRef.get(WaitForPrReviewFiltersService)).toBeInstanceOf(
      WaitForPrReviewFiltersService,
    );
    expect(moduleRef.get(PullRequestReviewCommentsService)).toBeInstanceOf(
      PullRequestReviewCommentsService,
    );
    expect(moduleRef.get(WaitForPrReviewArgsService)).toBeInstanceOf(
      WaitForPrReviewArgsService,
    );
  });

  it('does not resolve ChildProcessService, which is production-ops-only', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(() => moduleRef.get(ChildProcessService)).toThrow();
  });
});
