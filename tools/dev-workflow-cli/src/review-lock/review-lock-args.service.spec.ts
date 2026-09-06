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
});
