import { Module } from '@nestjs/common';

import { GitRootsService } from './shared/git-roots.service';
import { ProcessRunnerService } from './shared/process-runner.service';

@Module({
  providers: [ProcessRunnerService, GitRootsService],
})
export class AppModule {}
