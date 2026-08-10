import { Module } from '@nestjs/common';

import { ProcessRunnerService } from './shared/process-runner.service';

@Module({
  providers: [ProcessRunnerService],
})
export class AppModule {}
