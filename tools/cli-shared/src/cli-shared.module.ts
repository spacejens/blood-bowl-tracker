import { Module } from '@nestjs/common';

import { ChildProcessService } from './child-process.service';
import { GitRootsService } from './git-roots.service';
import { ProcessRunnerService } from './process-runner.service';

@Module({
  providers: [ChildProcessService, GitRootsService, ProcessRunnerService],
  exports: [ChildProcessService, GitRootsService, ProcessRunnerService],
})
export class CliSharedModule {}
