import type { TpPageClassification } from '@blood-bowl-tracker/tp-paths';
import { TpPageClassifierService } from '@blood-bowl-tracker/tp-paths';
import { Injectable, Logger } from '@nestjs/common';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { SleepService } from '../leader-election/sleep.service';
import type { TpImportTarget } from '../tp-import/tp-import-dispatch.service';
import { TpImportDispatchService } from '../tp-import/tp-import-dispatch.service';
import { TpImportFailureService } from '../tp-import/tp-import-failure.service';
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
 * same tournament is not queued again; it shares the queued job's result. No
 * other kind is merged.
 *
 * Only real failures are reported, judged by `TpImportFailureService` so
 * the feed and `/importtp` agree; every one is also logged here, so with no
 * debug channel to post to a failure is still visible.
 */
@Injectable()
export class TpFeedImportService {
  private readonly logger = new Logger(TpFeedImportService.name);
  private tail: Promise<unknown> = Promise.resolve();
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
      return queued;
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
      await this.sleep.sleep(TP_FEED_IMPORT_DELAY_MS);
      if (mergeKey !== undefined) {
        // From here the import reads TP afresh, so a later announcement is
        // no longer covered by it and must queue its own run.
        this.queuedTrophyJobs.delete(mergeKey);
      }
      const target = this.target(event);
      if (target === undefined) {
        return {
          failed: true,
          headline: `TP import failed: the link is not a TP ${this.expectedPage(event)} page`,
          errors: [],
        };
      }
      const assessment = this.failure.assess(
        await this.dispatch.dispatch({ page: target }),
      );
      if (!this.failure.isRealFailure(assessment)) {
        return { failed: false };
      }
      const outcome =
        assessment.status === 'failed' ? 'failed' : 'completed with errors';
      return {
        failed: true,
        headline: `TP import of ${assessment.subject} ${outcome}`,
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
