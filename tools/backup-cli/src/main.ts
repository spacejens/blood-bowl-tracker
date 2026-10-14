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
import {
  RestoreBackupRequest,
  RestoreBackupService,
} from './restore-backup/restore-backup.service';
import { BackupStorageService } from './storage/backup-storage.service';
import {
  VerifyBackupRequest,
  VerifyBackupService,
} from './verify-backup/verify-backup.service';

const SUBCOMMANDS = [
  'create',
  'list',
  'prune',
  'download',
  'verify',
  'restore',
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

const DOWNLOAD_USAGE =
  'Usage: node dist/main.js download <destination-path> [<backup-key>] ' +
  '(downloads the newest backup when the key is omitted)';

const VERIFY_USAGE =
  'Usage: node dist/main.js verify <target-database-url> [<backup-key>] ' +
  '(restores the newest backup when the key is omitted; the target must be ' +
  'an empty database on localhost)';

/** Arguments for `download`, `verify` and `restore`; absent for every other subcommand. */
interface DispatchArgs {
  readonly download?: DownloadBackupRequest;
  readonly verify?: VerifyBackupRequest;
  readonly restore?: RestoreBackupRequest;
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

function readVerifyRequest(): VerifyBackupRequest {
  const targetDatabaseUrl = process.argv[3];
  const key = process.argv[4];
  if (targetDatabaseUrl === undefined || targetDatabaseUrl === '') {
    throw new Error(VERIFY_USAGE);
  }
  return key === undefined || key === ''
    ? { targetDatabaseUrl }
    : { targetDatabaseUrl, key };
}

/** `restore [<backup-key>]`: the key is optional, so there is no usage error. */
function readRestoreRequest(): RestoreBackupRequest {
  const key = process.argv[3];
  return key === undefined || key === '' ? {} : { key };
}

function readArgs(subcommand: Subcommand): DispatchArgs {
  return {
    download: subcommand === 'download' ? readDownloadRequest() : undefined,
    verify: subcommand === 'verify' ? readVerifyRequest() : undefined,
    restore: subcommand === 'restore' ? readRestoreRequest() : undefined,
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
    case 'verify': {
      if (args.verify === undefined) {
        throw new Error(VERIFY_USAGE);
      }
      return app.get(VerifyBackupService).run(args.verify);
    }
    case 'restore':
      return app.get(RestoreBackupService).run(args.restore ?? {});
  }
}

void runCli({
  argv: process.argv,
  subcommands: SUBCOMMANDS,
  module: AppModule,
  readArgs,
  dispatch,
});
