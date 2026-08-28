import { CliSharedModule } from '@blood-bowl-tracker/cli-shared';
import { Module } from '@nestjs/common';

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

@Module({
  imports: [CliSharedModule],
  providers: [
    CheckMainStrayService,
    CheckDriftService,
    DriftDiffRedactionService,
    DiffHunkMembershipService,
    PostReviewQuestionsService,
    PostReviewQuestionsArgsService,
    WaitForPrReviewService,
    WaitForPrReviewFiltersService,
    PullRequestReviewCommentsService,
    WaitForPrReviewArgsService,
  ],
})
export class AppModule {}
