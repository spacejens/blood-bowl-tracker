import { Module } from '@nestjs/common';

import { CheckDriftService } from './check-drift/check-drift.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { DiffHunkMembershipService } from './post-review-questions/diff-hunk-membership.service';
import { PostReviewQuestionsService } from './post-review-questions/post-review-questions.service';
import { PostReviewQuestionsArgsService } from './post-review-questions/post-review-questions-args.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { RunProductionQueryService } from './run-production-query/run-production-query.service';
import { ChildProcessService } from './shared/child-process.service';
import { GitRootsService } from './shared/git-roots.service';
import { ProcessRunnerService } from './shared/process-runner.service';
import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';
import { PullRequestReviewCommentsService } from './wait-for-pr-review/pull-request-review-comments.service';
import { WaitForPrReviewService } from './wait-for-pr-review/wait-for-pr-review.service';
import { WaitForPrReviewArgsService } from './wait-for-pr-review/wait-for-pr-review-args.service';
import { WaitForPrReviewFiltersService } from './wait-for-pr-review/wait-for-pr-review-filters.service';
import { WriteFileService } from './write-file/write-file.service';

@Module({
  providers: [
    ProcessRunnerService,
    GitRootsService,
    CheckMainStrayService,
    DiffHunkMembershipService,
    PostReviewQuestionsService,
    PostReviewQuestionsArgsService,
    SyncGitignoredService,
    CheckDriftService,
    WriteFileService,
    WaitForPrReviewService,
    WaitForPrReviewFiltersService,
    PullRequestReviewCommentsService,
    WaitForPrReviewArgsService,
    CheckProductionConfigPortService,
    ChildProcessService,
    ProductionTunnelService,
    RunProductionQueryService,
  ],
})
export class AppModule {}
