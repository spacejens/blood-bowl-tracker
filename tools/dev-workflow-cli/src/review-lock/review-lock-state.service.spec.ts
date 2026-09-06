import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  EMPTY_REVIEW_LOCK_STATE,
  ReviewLockState,
  ReviewLockStateService,
} from './review-lock-state.service';

// Only `statSync` needs to be swappable, to simulate the mutex file
// vanishing between the failed create and the stat in the test below.
// Every other export passes through to the real `node:fs` implementation
// so the rest of this suite's real-filesystem tests are unaffected.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, statSync: vi.fn(actual.statSync) };
});

describe('ReviewLockStateService', () => {
  let service: ReviewLockStateService;
  let gitRoots: MockProxy<GitRootsService>;
  let fixture: string;
  let mainRoot: string;
  let statePath: string;
  let mutexPath: string;

  const HOLDER_STATE: ReviewLockState = {
    holder: {
      id: 'branch-a',
      acquiredAt: '2026-09-06T03:00:00.000Z',
      heartbeatAt: '2026-09-06T03:04:30.000Z',
    },
    queue: [{ id: 'branch-b', enqueuedAt: '2026-09-06T03:01:00.000Z' }],
  };

  const writeState = (content: string): void => {
    mkdirSync(join(mainRoot, '.claude/review-lock'), { recursive: true });
    writeFileSync(statePath, content, 'utf8');
  };

  const readState = (): unknown =>
    JSON.parse(readFileSync(statePath, 'utf8')) as unknown;

  beforeEach(async () => {
    fixture = mkdtempSync(join(tmpdir(), 'review-lock-'));
    mainRoot = join(fixture, 'main');
    mkdirSync(mainRoot, { recursive: true });
    statePath = join(mainRoot, '.claude/review-lock/state.json');
    mutexPath = `${statePath}.lock`;

    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot,
      worktreeRoot: join(fixture, 'worktree'),
      isWorktree: true,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewLockStateService,
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(ReviewLockStateService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(statSync).mockClear();
    rmSync(fixture, { recursive: true, force: true });
  });

  it('reads the empty state when no state file exists yet', async () => {
    await expect(service.read()).resolves.toEqual(EMPTY_REVIEW_LOCK_STATE);
  });

  it('reads a previously written state', async () => {
    writeState(JSON.stringify(HOLDER_STATE));

    await expect(service.read()).resolves.toEqual(HOLDER_STATE);
  });

  it('treats unparseable JSON as the empty state', async () => {
    writeState('{ this is not json');

    await expect(service.read()).resolves.toEqual(EMPTY_REVIEW_LOCK_STATE);
  });

  it('drops a malformed holder while keeping well-formed queue entries', async () => {
    writeState(
      JSON.stringify({
        holder: { id: 'branch-a' },
        queue: [
          { id: 'branch-b', enqueuedAt: '2026-09-06T03:01:00.000Z' },
          { id: 42 },
        ],
      }),
    );

    await expect(service.read()).resolves.toEqual({
      holder: null,
      queue: [{ id: 'branch-b', enqueuedAt: '2026-09-06T03:01:00.000Z' }],
    });
  });

  it('creates the directory lazily and writes the mutated state', async () => {
    const result = await service.mutate(() => ({
      state: HOLDER_STATE,
      result: 'done',
    }));

    expect(result).toBe('done');
    expect(readState()).toEqual(HOLDER_STATE);
  });

  it('passes the current state into the mutation and leaves no temp file behind', async () => {
    writeState(JSON.stringify(HOLDER_STATE));

    const seen = await service.mutate((state) => ({
      state: { holder: null, queue: state.queue },
      result: state.holder?.id,
    }));

    expect(seen).toBe('branch-a');
    expect(readState()).toEqual({ holder: null, queue: HOLDER_STATE.queue });
    expect(readdirSync(join(mainRoot, '.claude/review-lock')).sort()).toEqual([
      'state.json',
    ]);
  });

  it('removes the mutex file after a successful mutation', async () => {
    await service.mutate(() => ({ state: HOLDER_STATE, result: null }));

    expect(existsSync(mutexPath)).toBe(false);
  });

  it('removes the mutex file when the mutation throws', async () => {
    await expect(
      service.mutate(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(existsSync(mutexPath)).toBe(false);
  });

  it('force-clears a stale mutex file and proceeds immediately', async () => {
    mkdirSync(join(mainRoot, '.claude/review-lock'), { recursive: true });
    writeFileSync(mutexPath, '', 'utf8');
    const longAgo = new Date('2020-01-01T00:00:00.000Z');
    utimesSync(mutexPath, longAgo, longAgo);

    await service.mutate(() => ({ state: HOLDER_STATE, result: null }));

    expect(readState()).toEqual(HOLDER_STATE);
    expect(existsSync(mutexPath)).toBe(false);
  });

  it('waits, then force-clears a fresh mutex that never goes away', async () => {
    vi.useFakeTimers();
    mkdirSync(join(mainRoot, '.claude/review-lock'), { recursive: true });
    closeSync(openSync(mutexPath, 'wx'));

    const pending = service.mutate(() => ({
      state: HOLDER_STATE,
      result: null,
    }));
    await vi.advanceTimersByTimeAsync(6000);
    await pending;

    expect(readState()).toEqual(HOLDER_STATE);
  });

  it('paces the vanished-mutex retry branch instead of spinning', async () => {
    vi.useFakeTimers();
    mkdirSync(join(mainRoot, '.claude/review-lock'), { recursive: true });
    writeFileSync(mutexPath, '', 'utf8'); // mutex genuinely exists on disk
    const statMock = vi.mocked(statSync);
    const realStatSync = statMock.getMockImplementation();
    if (realStatSync === undefined) {
      throw new Error(
        'expected the mocked statSync to default to the real implementation',
      );
    }

    // Simulate the mutex vanishing between the failed create and the stat,
    // repeatedly: the file genuinely exists on disk (so tryCreateMutex's
    // real openSync(path, 'wx') keeps throwing EEXIST), but the next 5
    // statSync calls are made to report it as gone, hitting the
    // `ageMs === undefined` branch over and over — the "rapid, repeated
    // create/remove race" this fix paces against.
    let vanishedCallsRemaining = 5;
    statMock.mockImplementation((...args) => {
      if (vanishedCallsRemaining > 0) {
        vanishedCallsRemaining -= 1;
        return undefined;
      }
      return realStatSync(...args);
    });

    try {
      const pending = service.mutate(() => ({
        state: HOLDER_STATE,
        result: null,
      }));

      // Flush microtasks (but advance no real timer delay). The old, unpaced
      // code re-enters the loop synchronously on every `ageMs === undefined`
      // hit — no `await` in that branch — so it would burn through all 5
      // mocked "vanished" responses in this single tick before ever reaching
      // an `await`. The fixed code awaits `sleep(MUTEX_RETRY_MS)` on the very
      // first hit, which suspends execution before a second `statSync` call
      // can happen.
      await vi.advanceTimersByTimeAsync(0);
      expect(statMock).toHaveBeenCalledTimes(1);

      // Remove the real mutex file, then advance past the paced retry delay
      // so the next tryCreateMutex succeeds. Only the first of the 5 mocked
      // "vanished" responses is ever actually consumed — the point of this
      // test is that the branch pauses after that first hit rather than
      // spinning through all of them synchronously (asserted above); the
      // remaining stubbed responses exist only so an unpaced regression
      // would have something to spin through.
      rmSync(mutexPath);
      await vi.advanceTimersByTimeAsync(5 * 50 + 50);
      await pending;
    } finally {
      // Always restore, even if an assertion above throws — an unrestored
      // mock would return `undefined` from every later statSync call in
      // this file, poisoning every other test that touches `mutexAgeMs`.
      statMock.mockImplementation(realStatSync);
    }
  });

  it('eventually throws when a vanished mutex never resolves (persistent race)', async () => {
    vi.useFakeTimers();
    mkdirSync(join(mainRoot, '.claude/review-lock'), { recursive: true });
    // The mutex genuinely exists on disk for the whole test, so
    // tryCreateMutex's real openSync(path, 'wx') keeps throwing EEXIST and
    // never succeeds. statSync is mocked to report it as permanently gone,
    // simulating a persistent create/remove race in which this process can
    // never resolve ageMs. Before this fix, that branch just paced itself
    // forever without ever checking MUTEX_MAX_WAIT_MS, so it would hang
    // rather than reach the forced-clear-then-throw failure path.
    writeFileSync(mutexPath, '', 'utf8');
    const statMock = vi.mocked(statSync);
    const realStatSync = statMock.getMockImplementation();
    if (realStatSync === undefined) {
      throw new Error(
        'expected the mocked statSync to default to the real implementation',
      );
    }
    statMock.mockImplementation(() => undefined);

    try {
      const pending = service.mutate(() => ({
        state: HOLDER_STATE,
        result: null,
      }));
      // Attach the rejection assertion before advancing timers, so the
      // rejection (which happens mid-advance) is never briefly unhandled.
      const expectation = expect(pending).rejects.toThrow(
        'still held after a forced clear',
      );
      // Advance well past MUTEX_MAX_WAIT_MS (5000ms) twice over: once to
      // trip the forced clear, once more for the still-vanished retry to
      // hit the throw path.
      await vi.advanceTimersByTimeAsync(11_000);
      await expectation;
    } finally {
      statMock.mockImplementation(realStatSync);
      rmSync(mutexPath, { force: true });
    }
  });

  it('serializes concurrent mutations so neither overwrites the other', async () => {
    vi.useFakeTimers();

    const first = service.mutate((state) => ({
      state: {
        holder: state.holder,
        queue: [
          ...state.queue,
          { id: 'first', enqueuedAt: '2026-09-06T03:00:00.000Z' },
        ],
      },
      result: null,
    }));
    const second = service.mutate((state) => ({
      state: {
        holder: state.holder,
        queue: [
          ...state.queue,
          { id: 'second', enqueuedAt: '2026-09-06T03:00:01.000Z' },
        ],
      },
      result: null,
    }));
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([first, second]);

    const written = readState() as ReviewLockState;
    expect(written.queue.map((entry) => entry.id).sort()).toEqual([
      'first',
      'second',
    ]);
  });
});
