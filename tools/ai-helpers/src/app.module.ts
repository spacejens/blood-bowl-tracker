import { Module } from '@nestjs/common';

import { CheckDriftService } from './check-drift/check-drift.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { DiffHunkMembershipService } from './post-deferred-findings/diff-hunk-membership.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { ChildProcessService } from './shared/child-process.service';
import { GitRootsService } from './shared/git-roots.service';
import { ProcessRunnerService } from './shared/process-runner.service';
import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';
import { WaitForPrReviewService } from './wait-for-pr-review/wait-for-pr-review.service';
import { WaitForPrReviewArgsService } from './wait-for-pr-review/wait-for-pr-review-args.service';
import { WriteFileService } from './write-file/write-file.service';

@Module({
  providers: [
    ProcessRunnerService,
    GitRootsService,
    CheckMainStrayService,
    DiffHunkMembershipService,
    SyncGitignoredService,
    CheckDriftService,
    WriteFileService,
    WaitForPrReviewService,
    WaitForPrReviewArgsService,
    CheckProductionConfigPortService,
    ChildProcessService,
    ProductionTunnelService,
  ],
})
export class AppModule {}
