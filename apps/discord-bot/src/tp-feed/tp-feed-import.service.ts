import { TpBlockedError } from '@blood-bowl-tracker/import-tp-live';
import type { TpPageClassification } from '@blood-bowl-tracker/tp-paths';
import { TpPageClassifierService } from '@blood-bowl-tracker/tp-paths';
import { Injectable, Logger } from '@nestjs/common';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { SleepService } from '../leader-election/sleep.service';
import { ClockService } from '../shared/clock.service';
import type {
  TpImportOutcome,
  TpImportTarget,
} from '../tp-import/tp-import-dispatch.service';
import { TpImportDispatchService } from '../tp-import/tp-import-dispatch.service';
import { TpImportFailureService } from '../tp-import/tp-import-failure.service';
import { TpFeedBlockNoticeService } from './tp-feed-block-notice.service';
import type {
  TpFeedEvent,
  TpFeedImportFailure,
  TpFeedImportResult,
} from './tp-feed-event';

/**
 * How long each feed import waits before it starts. TP can post a
 * notification a moment before its own page reflects it, and the pause
 * also paces a burst of notifications like a person browsing.
 */
export const TP_FEED_IMPORT_DELAY_MS = 1000;

/**
 * How many times one feed import is retried after TP blocked it, each after
 * waiting out the block, before it is given up and reported as failed.
 */
export const TP_FEED_BLOCK_RETRIES = 3;

/** Extra wait past a block's end before retrying, so the retry is never early. */
export const TP_FEED_BLOCK_MARGIN_MS = 1000;

/**
 * Imports what a TP notification is about: the match of an end-of-match
 * notification, both teams of a start-of-match one, and the team of a
 * skill, hire or fire one, and, for a competition trophy announcement, the
 * whole competition as its scores page (forcing every completed match to be
 * backfilled, so the extra trophies computed from match events see them
 * all) — through the same dispatch `/importtp` uses.
 *
 * Imports run strictly one at a time, in the order they were enqueued, each
 * after {@link TP_FEED_IMPORT_DELAY_MS}, so a burst of notifications never
 * hits TP or the database in parallel. The queue is a promise chain: each
 * job starts when the previous one settles, and a job never rejects, so a
 * failure never stops the jobs behind it.
 *
 * Trophy announcements for one competition arrive in a burst. While one is
 * queued and has not yet finished its import delay, a further one for the
 * same tournament is not queued again; it shares the queued job's result,
 * marked `alreadyReported` when it is a failure, so the burst's failure is
 * reported once, by the announcement that queued the job. No other kind is
 * merged.
 *
 * When TP blocks requests (`TpBlockedError`), the job waits until the
 * block's back-off ends and retries, up to {@link TP_FEED_BLOCK_RETRIES}
 * times, holding up the queue behind it, so later jobs do not each hit TP
 * and fail. Only retries TP itself refused count; one the gate refused
 * without contacting TP does not. `TpFeedBlockNoticeService` gets one notice
 * when a block starts and one when an import next gets through, not one per
 * job. A job TP still blocks after its last retry is given up and reported
 * as a failure; from then until an import gets through again, every later
 * job that meets the block fails the same way at once, without waiting.
 *
 * Only real failures are reported, judged by `TpImportFailureService` so
 * the feed and `/importtp` agree; every one is also logged here, so with no
 * debug channel to post to a failure is still visible.
 */
@Injectable()
export class TpFeedImportService {
  private readonly logger = new Logger(TpFeedImportService.name);
  private tail: Promise<unknown> = Promise.resolve();
  private blocked = false;
  /**
   * The block the last job to give up met, until an import gets through
   * again: while it is set, jobs fail fast instead of waiting out blocks.
   */
  private gaveUpOn: TpBlockedError | undefined;
  private readonly queuedTrophyJobs = new Map<
    string,
    Promise<TpFeedImportResult>
  >();

  constructor(
    private readonly config: DiscordBotConfigService,
    private readonly classifier: TpPageClassifierService,
    private readonly dispatch: TpImportDispatchService,
    private readonly failure: TpImportFailureService,
    private readonly sleep: SleepService,
    private readonly clock: ClockService,
    private readonly blockNotice: TpFeedBlockNoticeService,
  ) {}

  /**
   * Queues the import for one notification, returning what it came to once
   * it has run. Synchronously appends to the queue, so a caller that
   * enqueues before its first `await` keeps arrival order. Never rejects.
   */
  enqueue(event: TpFeedEvent): Promise<TpFeedImportResult> {
    const mergeKey = this.mergeKey(event);
    const queued =
      mergeKey === undefined ? undefined : this.queuedTrophyJobs.get(mergeKey);
    if (queued !== undefined) {
      return queued.then((result) =>
        result.failed ? { ...result, alreadyReported: true } : result,
      );
    }
    const job = this.tail.then(() => this.run(event, mergeKey));
    if (mergeKey !== undefined) {
      this.queuedTrophyJobs.set(mergeKey, job);
    }
    this.tail = job.catch(() => undefined);
    return job;
  }

  private async run(
    event: TpFeedEvent,
    mergeKey: string | undefined,
  ): Promise<TpFeedImportResult> {
    const result = await this.attempt(event, mergeKey);
    if (result.failed) {
      this.logFailure(event, result);
    }
    return result;
  }

  /** Logging must never turn a finished import into a rejected job. */
  private logFailure(event: TpFeedEvent, result: TpFeedImportFailure): void {
    try {
      this.logger.warn(
        [`${result.headline} — ${event.link}`, ...result.errors].join('\n'),
      );
    } catch {
      // Nothing more can be done about a logger that itself fails.
    }
  }

  private async attempt(
    event: TpFeedEvent,
    mergeKey: string | undefined,
  ): Promise<TpFeedImportResult> {
    try {
      try {
        await this.sleep.sleep(TP_FEED_IMPORT_DELAY_MS);
      } finally {
        if (mergeKey !== undefined) {
          // From here the import reads TP afresh (or, if the delay failed,
          // never runs), so a later announcement is no longer covered by it
          // and must queue its own run.
          this.queuedTrophyJobs.delete(mergeKey);
        }
      }
      const target = this.target(event);
      if (target === undefined) {
        return {
          failed: true,
          headline: `TP import failed: the link is not a TP ${this.expectedPage(event)} page`,
          errors: [],
        };
      }
      const outcome = await this.dispatchThroughBlocks(target);
      if (outcome instanceof TpBlockedError) {
        return {
          failed: true,
          headline: `TP import gave up: TP was still blocking requests after ${TP_FEED_BLOCK_RETRIES} retries`,
          errors: [outcome.message],
        };
      }
      if ('skippedBecauseOf' in outcome) {
        return {
          failed: true,
          headline:
            'TP import skipped: TP is blocking requests and an earlier import gave up',
          errors: [outcome.skippedBecauseOf.message],
        };
      }
      const assessment = this.failure.assess(outcome);
      if (!this.failure.isRealFailure(assessment)) {
        return { failed: false };
      }
      const verdict =
        assessment.status === 'failed' ? 'failed' : 'completed with errors';
      return {
        failed: true,
        headline: `TP import of ${assessment.subject} ${verdict}`,
        errors: assessment.errors.map(
          (error) => `${error.label}: ${error.message}`,
        ),
      };
    } catch (error) {
      return {
        failed: true,
        headline: 'TP import failed unexpectedly',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Dispatches the import. When TP is blocking requests, waits until the
   * block's back-off ends and tries again; the queue behind this job waits
   * too. Only a retry TP itself answered with a block counts toward
   * TP_FEED_BLOCK_RETRIES, not one the gate refused without contacting TP.
   * Returns the outcome, or the last block when TP was still blocking after
   * the last retry, or the block an earlier job gave up on when this job
   * failed fast because of it. Once a block has interrupted a competition's backfill
   * (`backfillInterrupted`), every later retry of the job forces that
   * backfill, which a competition that now exists would otherwise skip;
   * other retries force nothing. Any other error propagates.
   *
   * Once a job has given up, later jobs fail fast until an import gets
   * through again: one queued before that block's back-off ends is not
   * dispatched at all, and one dispatched after it that TP still blocks is
   * not retried.
   */
  private async dispatchThroughBlocks(
    target: TpImportTarget,
  ): Promise<
    TpImportOutcome | TpBlockedError | { skippedBecauseOf: TpBlockedError }
  > {
    const gaveUpOn = this.gaveUpOn;
    if (
      gaveUpOn !== undefined &&
      this.clock.now().getTime() < gaveUpOn.retryAt.getTime()
    ) {
      return { skippedBecauseOf: gaveUpOn };
    }
    let retries = 0;
    let forceMatchBackfill = false;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const outcome = await this.dispatch.dispatch(
          forceMatchBackfill
            ? { page: target, forceMatchBackfill }
            : { page: target },
        );
        this.gaveUpOn = undefined;
        await this.markUnblocked();
        return outcome;
      } catch (error) {
        if (!(error instanceof TpBlockedError)) {
          throw error;
        }
        await this.markBlocked(error.retryAt);
        forceMatchBackfill ||= error.backfillInterrupted === true;
        if (attempt > 0 && error.answeredByTp) {
          retries += 1;
        }
        if (this.gaveUpOn !== undefined) {
          return { skippedBecauseOf: this.gaveUpOn };
        }
        if (retries >= TP_FEED_BLOCK_RETRIES) {
          this.gaveUpOn = error;
          return error;
        }
        await this.sleep.sleep(this.untilRetry(error.retryAt));
      }
    }
  }

  /** Announces a block only when it starts, not for every job it hits. */
  private async markBlocked(retryAt: Date): Promise<void> {
    if (this.blocked) {
      return;
    }
    this.blocked = true;
    await this.blockNotice.announceBlocked(retryAt);
  }

  /** Announces the first import that got through after a block. */
  private async markUnblocked(): Promise<void> {
    if (!this.blocked) {
      return;
    }
    this.blocked = false;
    await this.blockNotice.announceResumed();
  }

  private untilRetry(retryAt: Date): number {
    return (
      Math.max(0, retryAt.getTime() - this.clock.now().getTime()) +
      TP_FEED_BLOCK_MARGIN_MS
    );
  }

  /**
   * What to import for a notification, from its link: undefined when the
   * link is not the kind of TP page that notification should point to.
   */
  private target(event: TpFeedEvent): TpImportTarget | undefined {
    const page = this.classify(event.link);
    switch (event.kind) {
      case 'match-end':
        return page.kind === 'match' ? page : undefined;
      case 'match-start':
        return page.kind === 'match'
          ? {
              kind: 'matchTeams',
              tournamentSlug: page.tournamentSlug,
              matchId: page.matchId,
            }
          : undefined;
      case 'competition-trophy':
        return page.kind === 'competition'
          ? { kind: 'competitionScores', tournamentSlug: page.tournamentSlug }
          : undefined;
      case 'new-skill-or-characteristic':
      case 'hired':
      case 'fired':
        return page.kind === 'roster' ? page : undefined;
    }
  }

  private expectedPage(event: TpFeedEvent): 'match' | 'roster' | 'competition' {
    switch (event.kind) {
      case 'match-start':
      case 'match-end':
        return 'match';
      case 'competition-trophy':
        return 'competition';
      case 'new-skill-or-characteristic':
      case 'hired':
      case 'fired':
        return 'roster';
    }
  }

  /**
   * The key that merges queued trophy announcements: the tournament slug of
   * a trophy announcement's competition page. TP posts one announcement per
   * trophy, all at once, and one import of the competition covers them all.
   * Undefined for every other kind, and for a link that is not a
   * competition page (that one fails on its own when it runs).
   */
  private mergeKey(event: TpFeedEvent): string | undefined {
    if (event.kind !== 'competition-trophy') {
      return undefined;
    }
    try {
      const page = this.classify(event.link);
      return page.kind === 'competition' ? page.tournamentSlug : undefined;
    } catch {
      return undefined;
    }
  }

  private classify(link: string): TpPageClassification {
    return this.classifier.classify(link, this.config.getTpFrontendBaseUrl());
  }
}
