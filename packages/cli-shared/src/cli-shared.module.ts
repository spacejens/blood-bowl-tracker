import { Module } from '@nestjs/common';

import { DatabaseUrlRedactorService } from './database-url-redactor.service';
import { GitRootsService } from './git-roots.service';
import { LocalDatabaseGuardService } from './local-database-guard.service';
import { PgClientService } from './pg-client.service';
import { ProcessRunnerService } from './process-runner.service';
import { ProductionEnvFileService } from './production-env-file.service';
import { WriteFileService } from './write-file.service';

@Module({
  providers: [
    DatabaseUrlRedactorService,
    GitRootsService,
    LocalDatabaseGuardService,
    PgClientService,
    ProcessRunnerService,
    ProductionEnvFileService,
    WriteFileService,
  ],
  exports: [
    DatabaseUrlRedactorService,
    GitRootsService,
    LocalDatabaseGuardService,
    PgClientService,
    ProcessRunnerService,
    ProductionEnvFileService,
    WriteFileService,
  ],
})
export class CliSharedModule {}
