#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { ReviewOutcome } from './harness/review.service';
import { ReviewService } from './harness/review.service';

async function run(): Promise<ReviewOutcome> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    return await app.get(ReviewService).run();
  } finally {
    await app.close();
  }
}

run()
  .then((outcome) => {
    for (const gap of outcome.gaps) {
      console.warn(`Warning [${gap.source.toUpperCase()}]: ${gap.reason}`);
    }
    console.log(
      `Reviewed ${outcome.itemCount} match(es); report written to ${outcome.reportPath}.`,
    );
    // The postgres client keeps its socket (and the event loop) alive, and
    // DbModule has no shutdown hook, so a read-only CLI has to exit explicitly.
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('Review failed:', error);
    process.exit(1);
  });
