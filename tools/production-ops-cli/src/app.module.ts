import {
  ChildProcessService,
  GitRootsService,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Module } from '@nestjs/common';

import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { ResetProductionSchemaService } from './reset-production-schema/reset-production-schema.service';
import { RunProductionQueryService } from './run-production-query/run-production-query.service';

@Module({
  providers: [
    ProcessRunnerService,
    GitRootsService,
    ChildProcessService,
    CheckProductionConfigPortService,
    ProductionTunnelService,
    RunProductionQueryService,
    ResetProductionSchemaService,
  ],
})
export class AppModule {}
