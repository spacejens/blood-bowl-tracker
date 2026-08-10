import { Module } from '@nestjs/common';

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
  ],
})
export class AppModule {}
