import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

/** The session currently allowed to trigger reviews; `null` when free. */
export interface ReviewLockHolder {
  /** The holding session's identity — its worktree branch name. */
  readonly id: string;
  readonly acquiredAt: string;
  /** Refreshed by `heartbeat-review-lock`; how staleness is judged. */
  readonly heartbeatAt: string;
}

/** One session waiting its turn. The array's order is the wait order. */
export interface ReviewLockQueueEntry {
  readonly id: string;
  readonly enqueuedAt: string;
}

export interface ReviewLockState {
  readonly holder: ReviewLockHolder | null;
  readonly queue: readonly ReviewLockQueueEntry[];
}

/** What a mutation returns: the state to persist, plus the caller's answer. */
export interface ReviewLockMutation<T> {
  readonly state: ReviewLockState;
  readonly result: T;
}

export const EMPTY_REVIEW_LOCK_STATE: ReviewLockState = {
  holder: null,
  queue: [],
};

/** Repo-relative, resolved against the MAIN checkout so worktrees share it. */
const REVIEW_LOCK_STATE_PATH = '.claude/review-lock/state.json';
/** Sibling of the state file; its existence is the mutation mutex. */
const MUTEX_SUFFIX = '.lock';
/** Gap between attempts to take the mutex. */
const MUTEX_RETRY_MS = 50;
/**
 * A mutex older than this was left behind by a process that died mid-mutation.
 * It only ever guards one read-plus-write, so seconds is generous — this is a
 * much shorter-lived concern than the review lock's own heartbeat staleness.
 */
const MUTEX_STALE_MS = 10_000;
/** How long to wait for a live mutex before force-clearing it anyway. */
const MUTEX_MAX_WAIT_MS = 5_000;

/**
 * Owns the review lock's state file: where it lives, how it is read, and how
 * a read-modify-write cycle is made safe against other CLI processes doing
 * the same thing at the same time.
 *
 * Two separate concerns, deliberately: writes go through a temp file and an
 * atomic `rename`, so a *reader* never observes a half-written file; and a
 * sibling `.lock` created with the exclusive `wx` flag serializes whole
 * read-modify-write cycles, so two simultaneous acquires cannot both decide
 * they won.
 *
 * Knows the *shape* of the state but none of its policy — who may hold the
 * lock, and when, lives in `ReviewLockService`.
 */
@Injectable()
export class ReviewLockStateService {
  constructor(private readonly gitRoots: GitRootsService) {}

  /** The current state, or the empty state when there is nothing usable. */
  async read(): Promise<ReviewLockState> {
    return this.readAt(await this.statePath());
  }

  /**
   * Runs `change` against the current state under the mutation mutex and
   * persists whatever state it returns, handing back its `result`.
   */
  async mutate<T>(
    change: (state: ReviewLockState) => ReviewLockMutation<T>,
  ): Promise<T> {
    const path = await this.statePath();
    mkdirSync(dirname(path), { recursive: true });
    const mutexPath = `${path}${MUTEX_SUFFIX}`;
    await this.lockMutex(mutexPath);
    try {
      const { state, result } = change(this.readAt(path));
      this.writeAtomically(path, state);
      return result;
    } finally {
      this.unlockMutex(mutexPath);
    }
  }

  private async statePath(): Promise<string> {
    const { mainRoot } = await this.gitRoots.resolve();
    return join(mainRoot, REVIEW_LOCK_STATE_PATH);
  }

  /**
   * A missing file, unreadable file, unparseable JSON, or a structurally
   * wrong value all read as the empty state. Losing lock bookkeeping costs
   * some extra rate-limit contention — the very thing this feature reduces
   * rather than guarantees — which beats deadlocking an unattended run.
   */
  private readAt(path: string): ReviewLockState {
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      return EMPTY_REVIEW_LOCK_STATE;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return EMPTY_REVIEW_LOCK_STATE;
    }
    if (parsed === null || typeof parsed !== 'object') {
      return EMPTY_REVIEW_LOCK_STATE;
    }
    const { holder, queue } = parsed as {
      holder?: unknown;
      queue?: unknown;
    };
    return {
      holder: this.parseHolder(holder),
      queue: this.parseQueue(queue),
    };
  }

  private parseHolder(value: unknown): ReviewLockHolder | null {
    if (value === null || typeof value !== 'object') {
      return null;
    }
    const { id, acquiredAt, heartbeatAt } = value as {
      id?: unknown;
      acquiredAt?: unknown;
      heartbeatAt?: unknown;
    };
    return typeof id === 'string' &&
      id !== '' &&
      typeof acquiredAt === 'string' &&
      typeof heartbeatAt === 'string'
      ? { id, acquiredAt, heartbeatAt }
      : null;
  }

  /** Malformed entries are dropped individually; the rest keep their order. */
  private parseQueue(value: unknown): readonly ReviewLockQueueEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const entries: ReviewLockQueueEntry[] = [];
    for (const item of value as readonly unknown[]) {
      if (item === null || typeof item !== 'object') continue;
      const { id, enqueuedAt } = item as { id?: unknown; enqueuedAt?: unknown };
      if (
        typeof id === 'string' &&
        id !== '' &&
        typeof enqueuedAt === 'string'
      ) {
        entries.push({ id, enqueuedAt });
      }
    }
    return entries;
  }

  /**
   * Write-then-rename: `rename` within one directory is atomic, so a
   * concurrent reader sees either the whole old file or the whole new one.
   * The temp name carries the pid so two processes cannot collide on it.
   */
  private writeAtomically(path: string, state: ReviewLockState): void {
    const temporary = `${path}.tmp-${process.pid}`;
    const fd = openSync(temporary, 'w');
    try {
      writeSync(fd, `${JSON.stringify(state, null, 2)}\n`, null, 'utf8');
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  }

  /**
   * Takes the mutation mutex, retrying while another process holds it. A
   * mutex older than `MUTEX_STALE_MS`, or one still held after
   * `MUTEX_MAX_WAIT_MS`, is force-cleared: this guards a single JSON
   * read-plus-write, so a mutex outliving that window means the holder died.
   * A force-clear happens at most once per call, so a genuinely wedged mutex
   * fails loudly instead of spinning forever.
   */
  private async lockMutex(mutexPath: string): Promise<void> {
    const start = Date.now();
    let forced = false;
    for (;;) {
      if (this.tryCreateMutex(mutexPath)) {
        return;
      }
      const ageMs = this.mutexAgeMs(mutexPath);
      if (ageMs === undefined) {
        // It vanished between the failed create and the stat — just retry.
        continue;
      }
      if (ageMs > MUTEX_STALE_MS || Date.now() - start >= MUTEX_MAX_WAIT_MS) {
        if (forced) {
          throw new Error(
            `Could not take the review-lock mutation mutex at ${mutexPath}: ` +
              'still held after a forced clear',
          );
        }
        forced = true;
        this.unlockMutex(mutexPath);
        continue;
      }
      await this.sleep(MUTEX_RETRY_MS);
    }
  }

  /** True when this process created the mutex; false when another holds it. */
  private tryCreateMutex(mutexPath: string): boolean {
    try {
      closeSync(openSync(mutexPath, 'wx'));
      return true;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      ) {
        return false;
      }
      throw error;
    }
  }

  /** How old the mutex is, or `undefined` when it no longer exists. */
  private mutexAgeMs(mutexPath: string): number | undefined {
    const stat = statSync(mutexPath, { throwIfNoEntry: false });
    return stat === undefined ? undefined : Date.now() - stat.mtimeMs;
  }

  /** Best-effort: a mutex already gone is the outcome this wants anyway. */
  private unlockMutex(mutexPath: string): void {
    try {
      unlinkSync(mutexPath);
    } catch {
      // Nothing to do — see above.
    }
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
