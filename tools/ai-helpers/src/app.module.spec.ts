import {
  GitRootsService,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';
import { WriteFileService } from './write-file/write-file.service';

describe('AppModule', () => {
  it('wires every subcommand service with its dependencies resolved', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(ProcessRunnerService)).toBeInstanceOf(
      ProcessRunnerService,
    );
    expect(moduleRef.get(GitRootsService)).toBeInstanceOf(GitRootsService);
    expect(moduleRef.get(SyncGitignoredService)).toBeInstanceOf(
      SyncGitignoredService,
    );
    expect(moduleRef.get(WriteFileService)).toBeInstanceOf(WriteFileService);
  });
});
