#!/usr/bin/env node

import { runCli } from '@blood-bowl-tracker/cli-shared';
import { INestApplicationContext } from '@nestjs/common';

import { AppModule } from './app.module';
import {
  WorkflowLintResult,
  WorkflowLintService,
} from './lint/workflow-lint.service';

const SUBCOMMANDS = ['check'] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

/**
 * Prints each problem on its own stderr line (readable in CI logs) before
 * failing, since runCli's own error output is a single JSON line.
 */
function dispatch(app: INestApplicationContext): Promise<WorkflowLintResult> {
  const result = app.get(WorkflowLintService).run();
  if (result.problems.length === 0) {
    return Promise.resolve(result);
  }
  for (const problem of result.problems) {
    console.error(problem);
  }
  return Promise.reject(
    new Error(
      `${result.problems.length} workflow problem(s) found: every remote ` +
        'action must be pinned to a full commit SHA',
    ),
  );
}

void runCli<Subcommand, undefined>({
  argv: process.argv,
  subcommands: SUBCOMMANDS,
  module: AppModule,
  readArgs: () => undefined,
  dispatch,
});
