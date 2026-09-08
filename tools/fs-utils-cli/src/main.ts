#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { runCli } from '@blood-bowl-tracker/cli-shared';
import { INestApplicationContext } from '@nestjs/common';

import { AppModule } from './app.module';
import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';
import { WriteFileService } from './write-file/write-file.service';

const SUBCOMMANDS = ['sync-gitignored', 'write-file'] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

const WRITE_FILE_USAGE =
  'Usage: node dist/main.js write-file <repo-relative-path> ' +
  '(file content is read from stdin)';

/** Arguments for `write-file`; absent for every other subcommand. */
interface WriteFileInput {
  readonly path: string;
  readonly content: string;
}

interface DispatchArgs {
  readonly writeFile?: WriteFileInput;
}

function readWriteFileInput(): WriteFileInput {
  const path = process.argv[3];
  if (path === undefined || path === '') {
    throw new Error(WRITE_FILE_USAGE);
  }
  // fd 0 is stdin: read it fully before the Nest context is created.
  return { path, content: readFileSync(0, 'utf8') };
}

function readArgs(subcommand: Subcommand): DispatchArgs {
  return {
    writeFile: subcommand === 'write-file' ? readWriteFileInput() : undefined,
  };
}

function dispatch(
  app: INestApplicationContext,
  subcommand: Subcommand,
  args: DispatchArgs,
): Promise<unknown> {
  switch (subcommand) {
    case 'sync-gitignored':
      return app.get(SyncGitignoredService).run();
    case 'write-file': {
      if (args.writeFile === undefined) {
        throw new Error(WRITE_FILE_USAGE);
      }
      return app
        .get(WriteFileService)
        .run(args.writeFile.path, args.writeFile.content);
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
