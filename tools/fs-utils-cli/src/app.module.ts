import { CliSharedModule } from '@blood-bowl-tracker/cli-shared';
import { Module } from '@nestjs/common';

import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';
import { WriteFileService } from './write-file/write-file.service';

@Module({
  imports: [CliSharedModule],
  providers: [SyncGitignoredService, WriteFileService],
})
export class AppModule {}
