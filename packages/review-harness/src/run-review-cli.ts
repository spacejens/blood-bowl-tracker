import { runApp } from '@blood-bowl-tracker/cli-shared';
import type { DynamicModule, Type } from '@nestjs/common';

import type { ReviewOutcome } from './review-base.service';

/** The one thing the entry point needs from a tool's `ReviewService`. */
export interface ReviewRunner {
  run(): Promise<ReviewOutcome>;
}

/** What a review tool's `main.ts` supplies. */
export interface RunReviewCliOptions {
  /** The tool's root module, `AppModule.register()`. */
  readonly module: Type<unknown> | DynamicModule;
  /** The tool's own `ReviewService` class, looked up in the context. */
  readonly reviewService: Type<ReviewRunner>;
  /**
   * The reviewed noun with its plural marker, exactly as printed, e.g.
   * `'match(es)'` or `'star player(s)'`.
   */
  readonly itemLabel: string;
}

/**
 * The whole `main.ts` of a review tool: run its review, print every gap as a
 * warning, then where the report was written.
 *
 * A loose function rather than an `@Injectable()` service on purpose: it runs
 * before any Nest context exists and is what creates one (through
 * cli-shared's `runApp`), so DI cannot supply it — CLAUDE.md's "Service vs.
 * loose function", case 3 (bootstrap function).
 */
export function runReviewCli(options: RunReviewCliOptions): Promise<void> {
  return runApp({
    module: options.module,
    run: (app) => app.get(options.reviewService).run(),
    onOutcome: (outcome: ReviewOutcome) => {
      for (const gap of outcome.gaps) {
        console.warn(`Warning [${gap.source.toUpperCase()}]: ${gap.reason}`);
      }
      console.log(
        `Reviewed ${outcome.itemCount} ${options.itemLabel}; report written to ${outcome.reportPath}.`,
      );
      return undefined;
    },
    failureLabel: 'Review failed:',
    // The postgres client keeps its socket (and the event loop) alive, and
    // DbModule has no shutdown hook, so a read-only CLI has to exit explicitly.
    exitOnSuccess: true,
  });
}
