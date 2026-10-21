#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { GitRootsService, runCli } from '@blood-bowl-tracker/cli-shared';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { CheckCoderabbitActivityService } from './check-coderabbit-activity/check-coderabbit-activity.service';
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
import { AcquireReviewLockCleanupService } from './review-lock/acquire-review-lock-cleanup.service';
import { ReviewLockService } from './review-lock/review-lock.service';
import { ReviewLockArgsService } from './review-lock/review-lock-args.service';
import { WaitForPrReviewService } from './wait-for-pr-review/wait-for-pr-review.service';
import { WaitForPrReviewArgsService } from './wait-for-pr-review/wait-for-pr-review-args.service';

const SUBCOMMANDS = [
  'resolve-main-root',
  'check-main-stray',
  'check-drift',
  'check-dependency-dashboard',
  'check-coderabbit-activity',
  'wait-for-pr-review',
  'post-review-questions',
  'acquire-review-lock',
  'heartbeat-review-lock',
  'release-review-lock',
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

interface DispatchArgs {
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

function readArgs(subcommand: Subcommand): DispatchArgs {
  return { stdin: readsStdin(subcommand) ? readStdin() : undefined };
}

function dispatch(
  app: INestApplicationContext,
  subcommand: Subcommand,
  args: DispatchArgs,
): Promise<unknown> {
  switch (subcommand) {
    case 'resolve-main-root':
      return app.get(GitRootsService).resolve();
    case 'check-main-stray':
      return app.get(CheckMainStrayService).run();
    case 'check-drift':
      return app.get(CheckDriftService).run();
    case 'check-coderabbit-activity':
      // argv[3] is the PR number; the service validates it, so a missing or
      // malformed value surfaces as this CLI's standard JSON error + exit 1.
      return app.get(CheckCoderabbitActivityService).run(process.argv[3]);
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
      if (args.stdin === undefined) {
        throw new Error(CHECK_DEPENDENCY_DASHBOARD_USAGE);
      }
      return Promise.resolve(
        app.get(CheckDependencyDashboardService).run(args.stdin),
      );
    }
    case 'post-review-questions': {
      if (args.stdin === undefined) {
        throw new Error(POST_REVIEW_QUESTIONS_USAGE);
      }
      const postReviewQuestionsInput = app
        .get(PostReviewQuestionsArgsService)
        .parse(process.argv, args.stdin);
      return app.get(PostReviewQuestionsService).run(postReviewQuestionsInput);
    }
  }
}

/**
 * Hands back a lock acquisition whose CLI run then failed on its way out. The
 * new holder is already on disk by the time `acquire` resolves, so a later
 * failure — closing the Nest context, serialising the result — would leave
 * the lock held by a session that was told it failed and has moved on
 * unlocked, blocking every queued session until the lock goes stale. A fresh
 * application context is bootstrapped rather than reusing the one whose close
 * just failed, whose state is by definition unknown; the actual decision and
 * release live in `AcquireReviewLockCleanupService`, which is unit tested on
 * its own.
 */
async function onCleanupFailureAfterDispatch(
  result: unknown,
  subcommand: Subcommand,
): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    await app
      .get(AcquireReviewLockCleanupService)
      .releaseIfAcquired(subcommand, result, process.argv);
  } finally {
    await app.close();
  }
}

void runCli({
  argv: process.argv,
  subcommands: SUBCOMMANDS,
  module: AppModule,
  readArgs,
  dispatch,
  onCleanupFailureAfterDispatch,
});
