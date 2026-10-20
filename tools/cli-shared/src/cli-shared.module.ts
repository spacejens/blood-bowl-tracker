import { Module } from '@nestjs/common';

import { GitRootsService } from './git-roots.service';
import { ProcessRunnerService } from './process-runner.service';
import { ProductionEnvFileService } from './production-env-file.service';

@Module({
  providers: [GitRootsService, ProcessRunnerService, ProductionEnvFileService],
  exports: [GitRootsService, ProcessRunnerService, ProductionEnvFileService],
})
export class CliSharedModule {}
