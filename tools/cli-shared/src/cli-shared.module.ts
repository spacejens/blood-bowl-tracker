import { Module } from '@nestjs/common';

import { DatabaseUrlRedactorService } from './database-url-redactor.service';
import { GitRootsService } from './git-roots.service';
import { PgClientService } from './pg-client.service';
import { ProcessRunnerService } from './process-runner.service';
import { ProductionEnvFileService } from './production-env-file.service';

@Module({
  providers: [
    DatabaseUrlRedactorService,
    GitRootsService,
    PgClientService,
    ProcessRunnerService,
    ProductionEnvFileService,
  ],
  exports: [
    DatabaseUrlRedactorService,
    GitRootsService,
    PgClientService,
    ProcessRunnerService,
    ProductionEnvFileService,
  ],
})
export class CliSharedModule {}
