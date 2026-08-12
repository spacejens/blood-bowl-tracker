import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { WaitForPrReviewArgsService } from './wait-for-pr-review-args.service';

/** argv as node builds it: [node, script, subcommand, ...arguments]. */
function argv(...args: string[]): string[] {
  return ['node', 'dist/main.js', 'wait-for-pr-review', ...args];
}

const POSITIONAL = ['392', 'spacejens', '1760000000'];

describe('WaitForPrReviewArgsService', () => {
  let service: WaitForPrReviewArgsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WaitForPrReviewArgsService],
    }).compile();
    service = moduleRef.get(WaitForPrReviewArgsService);
  });

  it('reads the three positional arguments', () => {
    expect(service.parse(argv(...POSITIONAL))).toEqual({
      prNumber: '392',
      developerLogin: 'spacejens',
      sinceEpochSeconds: 1_760_000_000,
      timeoutMs: undefined,
      intervalMs: undefined,
    });
  });

  it('reads every optional flag', () => {
    const result = service.parse(
      argv(
        ...POSITIONAL,
        '--timeout-ms=900000',
        '--interval-ms=30000',
        '--exclude-review-id=PRR_review1',
        '--exclude-comment-id=IC_comment1',
        '--trigger-after=1760003600',
      ),
    );

    expect(result).toEqual({
      prNumber: '392',
      developerLogin: 'spacejens',
      sinceEpochSeconds: 1_760_000_000,
      timeoutMs: 900_000,
      intervalMs: 30_000,
      excludeReviewId: 'PRR_review1',
      excludeCommentId: 'IC_comment1',
      triggerAfterEpochSeconds: 1_760_003_600,
    });
  });

  it('omits the id and trigger fields entirely when their flags are absent', () => {
    const result = service.parse(argv(...POSITIONAL));

    expect(result).not.toHaveProperty('excludeReviewId');
    expect(result).not.toHaveProperty('excludeCommentId');
    expect(result).not.toHaveProperty('triggerAfterEpochSeconds');
  });

  it.each([
    ['--trigger-after=soon'],
    ['--trigger-after='],
    ['--trigger-after=0'],
    ['--trigger-after=1760003600.5'],
  ])('rejects a malformed %s', (flag) => {
    expect(() => service.parse(argv(...POSITIONAL, flag))).toThrow(
      /bad --trigger-after value/,
    );
  });

  it('rejects an interval below the minimum', () => {
    expect(() => service.parse(argv(...POSITIONAL, '--interval-ms=1'))).toThrow(
      /bad --interval-ms value/,
    );
  });

  it.each([
    [[]],
    [['0', 'spacejens', '1760000000']],
    [['abc', 'spacejens', '1760000000']],
    [['392', '', '1760000000']],
    [['392', 'spacejens', 'yesterday']],
    [['392', 'spacejens', '']],
  ])('rejects bad positional arguments %j', (args) => {
    expect(() => service.parse(argv(...args))).toThrow(/Usage:/);
  });
});
