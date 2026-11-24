#!/usr/bin/env node

import { runReviewCli } from '@blood-bowl-tracker/review-harness';

import { AppModule } from './app.module';
import { ReviewService } from './harness/review.service';

void runReviewCli({
  module: AppModule.register(),
  reviewService: ReviewService,
  itemLabel: 'match(es)',
});
