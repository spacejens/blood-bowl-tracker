#!/usr/bin/env node

import { runCli } from '@blood-bowl-tracker/cli-shared';
import { INestApplicationContext } from '@nestjs/common';

import { AppModule } from './app.module';
import { CreateBackupService } from './create-backup/create-backup.service';
import {
  DownloadBackupRequest,
  DownloadBackupService,
} from './download-backup/download-backup.service';
import { PruneBackupsService } from './prune-backups/prune-backups.service';
import { BackupStorageService } from './storage/backup-storage.service';

const SUBCOMMANDS = ['create', 'list', 'prune', 'download'] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

const DOWNLOAD_USAGE =
  'Usage: node dist/main.js download <destination-path> [<backup-key>] ' +
  '(downloads the newest backup when the key is omitted)';

/** Arguments for `download`; absent for every other subcommand. */
interface DispatchArgs {
  readonly download?: DownloadBackupRequest;
}

function readDownloadRequest(): DownloadBackupRequest {
  const destinationPath = process.argv[3];
  const key = process.argv[4];
  if (destinationPath === undefined || destinationPath === '') {
    throw new Error(DOWNLOAD_USAGE);
  }
  return key === undefined || key === ''
    ? { destinationPath }
    : { destinationPath, key };
}

function readArgs(subcommand: Subcommand): DispatchArgs {
  return {
    download: subcommand === 'download' ? readDownloadRequest() : undefined,
  };
}

function dispatch(
  app: INestApplicationContext,
  subcommand: Subcommand,
  args: DispatchArgs,
): Promise<unknown> {
  switch (subcommand) {
    case 'create':
      return app.get(CreateBackupService).run();
    case 'list':
      return app.get(BackupStorageService).list();
    case 'prune':
      return app.get(PruneBackupsService).run();
    case 'download': {
      if (args.download === undefined) {
        throw new Error(DOWNLOAD_USAGE);
      }
      return app.get(DownloadBackupService).run(args.download);
    }
  }
}

void runCli({
  argv: process.argv,
  subcommands: SUBCOMMANDS,
  module: AppModule,
  readArgs,
  dispatch,
});
