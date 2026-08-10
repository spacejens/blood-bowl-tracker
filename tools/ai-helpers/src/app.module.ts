import { Module } from '@nestjs/common';

import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { GitRootsService } from './shared/git-roots.service';
import { ProcessRunnerService } from './shared/process-runner.service';

@Module({
  providers: [ProcessRunnerService, GitRootsService, CheckMainStrayService],
})
export class AppModule {}
