import { mock, MockProxy } from 'vitest-mock-extended';

import {
  EMPTY_REVIEW_LOCK_STATE,
  ReviewLockMutation,
  ReviewLockState,
  ReviewLockStateService,
} from './review-lock-state.service';

/** A fake state store plus a reader for what the subject wrote into it. */
export interface FakeReviewLockStore {
  readonly state: MockProxy<ReviewLockStateService>;
  /** The state as it stands after every mutation applied so far. */
  current(): ReviewLockState;
}

/**
 * A mocked `ReviewLockStateService` backed by an in-memory value.
 *
 * This is a canned store, not a reimplementation of the collaborator: the
 * real service's actual behaviour is file I/O — path resolution, tolerant
 * parsing, atomic rename, the `wx` mutex — and none of that is copied here.
 * Holding a value so the subject's own state transitions can be asserted is
 * what makes `ReviewLockService`'s logic observable at all.
 */
export function createFakeState(
  initial: ReviewLockState = EMPTY_REVIEW_LOCK_STATE,
): FakeReviewLockStore {
  let value = initial;
  const state = mock<ReviewLockStateService>();
  state.read.mockImplementation(() => Promise.resolve(value));
  state.mutate.mockImplementation(
    <T>(change: (s: ReviewLockState) => ReviewLockMutation<T>): Promise<T> => {
      const { state: next, result } = change(value);
      value = next;
      return Promise.resolve(result);
    },
  );
  return { state, current: () => value };
}

/** A holder entry with fixed timestamps, so assertions stay deterministic. */
export function holderOf(id: string, heartbeatAt: string) {
  return { id, acquiredAt: '2026-09-06T03:00:00.000Z', heartbeatAt };
}

/** A queue entry with a fixed timestamp. */
export function queuedOf(id: string, enqueuedAt = '2026-09-06T03:01:00.000Z') {
  return { id, enqueuedAt };
}
