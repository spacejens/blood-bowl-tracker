import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ReviewLockArgsService } from './review-lock-args.service';

describe('ReviewLockArgsService', () => {
  let service: ReviewLockArgsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ReviewLockArgsService],
    }).compile();
    service = moduleRef.get(ReviewLockArgsService);
  });

  const argv = (...args: readonly string[]): readonly string[] => [
    'node',
    'main.js',
    'acquire-review-lock',
    ...args,
  ];

  it('parses a bare holder id', () => {
    expect(service.parse(argv('worktree-issue-757'))).toEqual({
      holderId: 'worktree-issue-757',
    });
  });

  it('parses the optional timeout and interval flags', () => {
    expect(
      service.parse(
        argv('branch-a', '--timeout-ms=600000', '--interval-ms=5000'),
      ),
    ).toEqual({
      holderId: 'branch-a',
      timeoutMs: 600000,
      intervalMs: 5000,
    });
  });

  it('rejects a missing holder id', () => {
    expect(() => service.parse(argv())).toThrow('Usage:');
  });

  it('rejects a blank holder id', () => {
    expect(() => service.parse(argv('   '))).toThrow('Usage:');
  });

  it('rejects a flag-shaped value in the holder-id position', () => {
    expect(() => service.parse(argv('--timeout-ms=5'))).toThrow('Usage:');
  });

  it('rejects an interval below the 1000ms minimum', () => {
    expect(() => service.parse(argv('branch-a', '--interval-ms=10'))).toThrow(
      'bad --interval-ms value',
    );
  });

  it('rejects a non-integer timeout', () => {
    expect(() => service.parse(argv('branch-a', '--timeout-ms=soon'))).toThrow(
      'bad --timeout-ms value',
    );
  });

  it('rejects a negative timeout', () => {
    expect(() => service.parse(argv('branch-a', '--timeout-ms=-1'))).toThrow(
      'bad --timeout-ms value',
    );
  });

  it('rejects an unrecognized flag', () => {
    expect(() => service.parse(argv('branch-a', '--timeout=600000'))).toThrow(
      'Usage:',
    );
  });

  it('rejects an empty --timeout-ms value', () => {
    expect(() => service.parse(argv('branch-a', '--timeout-ms='))).toThrow(
      'bad --timeout-ms value',
    );
  });

  it('rejects an empty --interval-ms value', () => {
    expect(() => service.parse(argv('branch-a', '--interval-ms='))).toThrow(
      'bad --interval-ms value',
    );
  });

  it('rejects a duplicate --timeout-ms flag even when the first is valid and the second is malformed', () => {
    expect(() =>
      service.parse(argv('branch-a', '--timeout-ms=5', '--timeout-ms=')),
    ).toThrow('duplicate --timeout-ms flag');
  });

  it('rejects a duplicate --interval-ms flag regardless of order', () => {
    expect(() =>
      service.parse(argv('branch-a', '--interval-ms=', '--interval-ms=5000')),
    ).toThrow('duplicate --interval-ms flag');
  });
});
