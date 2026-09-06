#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import {
  CHECK_DEPENDENCY_DASHBOARD_USAGE,
  CheckDependencyDashboardService,
} from './check-dependency-dashboard/check-dependency-dashboard.service';
import { CheckDriftService } from './check-drift/check-drift.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { PostReviewQuestionsService } from './post-review-questions/post-review-questions.service';
import {
  POST_REVIEW_QUESTIONS_USAGE,
  PostReviewQuestionsArgsService,
} from './post-review-questions/post-review-questions-args.service';
import { ReviewLockService } from './review-lock/review-lock.service';
import { ReviewLockArgsService } from './review-lock/review-lock-args.service';
import { WaitForPrReviewService } from './wait-for-pr-review/wait-for-pr-review.service';
import { WaitForPrReviewArgsService } from './wait-for-pr-review/wait-for-pr-review-args.service';

const SUBCOMMANDS = [
  'resolve-main-root',
  'check-main-stray',
  'check-drift',
  'check-dependency-dashboard',
  'wait-for-pr-review',
  'post-review-questions',
  'acquire-review-lock',
  'heartbeat-review-lock',
  'release-review-lock',
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string | undefined): value is Subcommand {
  return SUBCOMMANDS.includes(value as Subcommand);
}

interface DispatchOptions {
  readonly app: INestApplicationContext;
  readonly subcommand: Subcommand;
  /** Present only for the subcommands that take JSON on stdin. */
  readonly stdin?: string;
}

/** The subcommands whose input arrives as JSON on stdin. */
function readsStdin(subcommand: Subcommand): boolean {
  return (
    subcommand === 'post-review-questions' ||
    subcommand === 'check-dependency-dashboard'
  );
}

function readStdin(): string {
  // fd 0 is stdin: read it fully before the Nest context is created.
  return readFileSync(0, 'utf8');
}

function dispatch(options: DispatchOptions): Promise<unknown> {
  const { app, subcommand } = options;
  switch (subcommand) {
    case 'resolve-main-root':
      return app.get(GitRootsService).resolve();
    case 'check-main-stray':
      return app.get(CheckMainStrayService).run();
    case 'check-drift':
      return app.get(CheckDriftService).run();
    case 'wait-for-pr-review': {
      const waitOptions = app
        .get(WaitForPrReviewArgsService)
        .parse(process.argv);
      return app.get(WaitForPrReviewService).run(waitOptions);
    }
    case 'acquire-review-lock': {
      const lockOptions = app.get(ReviewLockArgsService).parse(process.argv);
      return app.get(ReviewLockService).acquire(lockOptions);
    }
    case 'heartbeat-review-lock': {
      const { holderId } = app.get(ReviewLockArgsService).parse(process.argv);
      return app.get(ReviewLockService).heartbeat(holderId);
    }
    case 'release-review-lock': {
      const { holderId } = app.get(ReviewLockArgsService).parse(process.argv);
      return app.get(ReviewLockService).release(holderId);
    }
    case 'check-dependency-dashboard': {
      if (options.stdin === undefined) {
        throw new Error(CHECK_DEPENDENCY_DASHBOARD_USAGE);
      }
      return Promise.resolve(
        app.get(CheckDependencyDashboardService).run(options.stdin),
      );
    }
    case 'post-review-questions': {
      if (options.stdin === undefined) {
        throw new Error(POST_REVIEW_QUESTIONS_USAGE);
      }
      const postReviewQuestionsInput = app
        .get(PostReviewQuestionsArgsService)
        .parse(process.argv, options.stdin);
      return app.get(PostReviewQuestionsService).run(postReviewQuestionsInput);
    }
  }
}

async function run(): Promise<unknown> {
  const subcommand = process.argv[2];
  if (!isSubcommand(subcommand)) {
    throw new Error(
      `Usage: node dist/main.js <${SUBCOMMANDS.join('|')}>` +
        (subcommand === undefined || subcommand === ''
          ? ''
          : ` (got '${subcommand}')`),
    );
  }

  const stdin = readsStdin(subcommand) ? readStdin() : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    return await dispatch({ app, subcommand, stdin });
  } finally {
    await app.close();
  }
}

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ error: message }));
    process.exit(1);
  });
