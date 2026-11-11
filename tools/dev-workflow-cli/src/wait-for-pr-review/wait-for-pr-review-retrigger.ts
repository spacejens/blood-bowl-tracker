import { MergeRetriggerResult } from './review-retrigger-merge.service';

/** How a `triggerMergeMain` retrigger actually asked for the review. */
export interface RetriggerReport {
  /**
   * `merge-push` when a pushed merge of `main` asked for it; `comment` when
   * the fallback comment did; `none` when nothing asked for a review —
   * either the fallback comment could not be posted, or the merge
   * conflicted, which posts no comment by design and ends the wait with
   * `mergeConflict` so the caller resolves the conflict.
   */
  readonly method: 'merge-push' | 'comment' | 'none';
  /** One-line reason the merge could not be used; present only when no merge was pushed for a reason worth reporting. */
  readonly mergeFailure?: string;
}

/** What one trigger did, for `pollUntilDone` to record and act on. */
export interface TriggerOutcome {
  /** How the review was asked for; absent when no merge was requested for this trigger. */
  readonly report?: RetriggerReport;
  /** True only when the `triggerMergeMain` merge conflicted: the wait then ends at once. */
  readonly mergeConflict?: boolean;
}

/** What `triggerReview` needs to know about the wait's deadline. */
export interface TriggerClock {
  /** The time left for one step, or one interval once the deadline is spent. */
  readonly budgetMs: () => number;
  /** The time left before the deadline; zero or negative once it has passed. */
  readonly remainingMs: () => number;
}

/** Stands in for the merge attempt when the deadline has passed before it could start. */
export const MERGE_SKIPPED_PAST_DEADLINE: MergeRetriggerResult = {
  pushed: false,
  failure: 'the wait deadline had already passed; no merge was started',
};

/** Where `pollUntilDone` records the retrigger it fired, for `run` to attach. */
export interface RetriggerState {
  report?: RetriggerReport;
}
