import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
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
