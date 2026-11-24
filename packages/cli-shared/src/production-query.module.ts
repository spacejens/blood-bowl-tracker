import { Module } from '@nestjs/common';

import { CliSharedModule } from './cli-shared.module';
import { RunProductionQueryService } from './run-production-query.service';

/**
 * The read-only production query runner, for the CLIs that query
 * production. Kept out of `CliSharedModule`, like `ChildProcessModule`, so
 * only those CLIs resolve it.
 */
@Module({
  imports: [CliSharedModule],
  providers: [RunProductionQueryService],
  exports: [RunProductionQueryService],
})
export class ProductionQueryModule {}
