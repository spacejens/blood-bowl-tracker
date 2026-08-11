import { Module } from '@nestjs/common';

import { CheckDriftService } from './check-drift/check-drift.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { GitRootsService } from './shared/git-roots.service';
import { ProcessRunnerService } from './shared/process-runner.service';
import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';

@Module({
  providers: [
    ProcessRunnerService,
    GitRootsService,
    CheckMainStrayService,
    SyncGitignoredService,
    CheckDriftService,
  ],
})
export class AppModule {}
