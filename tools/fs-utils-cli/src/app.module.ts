import { CliSharedModule } from '@blood-bowl-tracker/cli-shared';
import { Module } from '@nestjs/common';

import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';

@Module({
  imports: [CliSharedModule],
  providers: [SyncGitignoredService],
})
export class AppModule {}
