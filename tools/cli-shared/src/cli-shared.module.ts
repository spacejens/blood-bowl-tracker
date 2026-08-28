import { Module } from '@nestjs/common';

import { GitRootsService } from './git-roots.service';
import { ProcessRunnerService } from './process-runner.service';

@Module({
  providers: [GitRootsService, ProcessRunnerService],
  exports: [GitRootsService, ProcessRunnerService],
})
export class CliSharedModule {}
