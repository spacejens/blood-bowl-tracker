import {
  ChildProcessService,
  GitRootsService,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { CheckDriftService } from './check-drift/check-drift.service';
import { DriftDiffRedactionService } from './check-drift/drift-diff-redaction.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { ResetProductionSchemaService } from './reset-production-schema/reset-production-schema.service';
import { RunProductionQueryService } from './run-production-query/run-production-query.service';
import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';
import { PullRequestReviewCommentsService } from './wait-for-pr-review/pull-request-review-comments.service';
import { WaitForPrReviewService } from './wait-for-pr-review/wait-for-pr-review.service';
import { WaitForPrReviewArgsService } from './wait-for-pr-review/wait-for-pr-review-args.service';
import { WaitForPrReviewFiltersService } from './wait-for-pr-review/wait-for-pr-review-filters.service';
import { WriteFileService } from './write-file/write-file.service';

describe('AppModule', () => {
  it('wires every subcommand service with its dependencies resolved', async () => {
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
    expect(moduleRef.get(SyncGitignoredService)).toBeInstanceOf(
      SyncGitignoredService,
    );
    expect(moduleRef.get(CheckDriftService)).toBeInstanceOf(CheckDriftService);
    expect(moduleRef.get(DriftDiffRedactionService)).toBeInstanceOf(
      DriftDiffRedactionService,
    );
    expect(moduleRef.get(WriteFileService)).toBeInstanceOf(WriteFileService);
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
    expect(moduleRef.get(CheckProductionConfigPortService)).toBeInstanceOf(
      CheckProductionConfigPortService,
    );
    expect(moduleRef.get(ChildProcessService)).toBeInstanceOf(
      ChildProcessService,
    );
    expect(moduleRef.get(ProductionTunnelService)).toBeInstanceOf(
      ProductionTunnelService,
    );
    expect(moduleRef.get(RunProductionQueryService)).toBeInstanceOf(
      RunProductionQueryService,
    );
    expect(moduleRef.get(ResetProductionSchemaService)).toBeInstanceOf(
      ResetProductionSchemaService,
    );
  });
});
