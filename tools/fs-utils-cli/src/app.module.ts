import {
  GitRootsService,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Module } from '@nestjs/common';

import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';
import { WriteFileService } from './write-file/write-file.service';

@Module({
  providers: [
    ProcessRunnerService,
    GitRootsService,
    SyncGitignoredService,
    WriteFileService,
  ],
})
export class AppModule {}
