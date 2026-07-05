import { Module } from '@nestjs/common';
import { ImportRunnerService } from './import-runner.service';

@Module({
  providers: [ImportRunnerService],
  exports: [ImportRunnerService],
})
export class ImportModule {}
