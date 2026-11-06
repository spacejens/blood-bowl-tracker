/** How a `triggerMergeMain` retrigger actually asked for the review. */
export interface RetriggerReport {
  /**
   * `merge-push` when a pushed merge of `main` asked for it; `comment` when
   * the fallback comment did; `none` when the fallback comment could not be
   * posted either, so nothing asked for a review.
   */
  readonly method: 'merge-push' | 'comment' | 'none';
  /** One-line reason the merge could not be used; present only when no merge was pushed for a reason worth reporting. */
  readonly mergeFailure?: string;
}

/** What `triggerReview` needs to know about the wait's deadline. */
export interface TriggerClock {
  /** The time left for one step, or one interval once the deadline is spent. */
  readonly budgetMs: () => number;
  /** The time left before the deadline; zero or negative once it has passed. */
  readonly remainingMs: () => number;
}

/** Stands in for the merge attempt when the deadline has passed before it could start. */
export const MERGE_SKIPPED_PAST_DEADLINE = {
  pushed: false,
  failure: 'the wait deadline had already passed; no merge was started',
} as const;

/** Where `pollUntilDone` records the retrigger it fired, for `run` to attach. */
export interface RetriggerState {
  report?: RetriggerReport;
}
