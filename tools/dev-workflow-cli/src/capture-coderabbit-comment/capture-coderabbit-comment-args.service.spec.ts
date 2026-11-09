import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CAPTURE_CODERABBIT_COMMENT_USAGE,
  CaptureCoderabbitCommentArgsService,
} from './capture-coderabbit-comment-args.service';

const PREFIX = ['node', 'main.js', 'capture-coderabbit-comment'];

describe('CaptureCoderabbitCommentArgsService', () => {
  let service: CaptureCoderabbitCommentArgsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CaptureCoderabbitCommentArgsService],
    }).compile();
    service = moduleRef.get(CaptureCoderabbitCommentArgsService);
  });

  it('parses a bare PR number', () => {
    expect(service.parse([...PREFIX, '1350'])).toEqual({ prNumber: '1350' });
  });

  it('parses both optional flags', () => {
    expect(
      service.parse([
        ...PREFIX,
        '1350',
        '--timeout-ms=600000',
        '--interval-ms=5000',
      ]),
    ).toEqual({ prNumber: '1350', timeoutMs: 600_000, intervalMs: 5000 });
  });

  it.each([
    ['--timeout-ms=600000', { timeoutMs: 600_000 }],
    ['--interval-ms=5000', { intervalMs: 5000 }],
    ['--settle-ms=45000', { settleMs: 45_000 }],
  ])('parses the lone flag %s', (arg, expected) => {
    expect(service.parse([...PREFIX, '1350', arg])).toEqual({
      prNumber: '1350',
      ...expected,
    });
  });

  it('takes the last value of a repeated flag', () => {
    expect(
      service.parse([
        ...PREFIX,
        '1350',
        '--timeout-ms=1000',
        '--timeout-ms=2000',
      ]),
    ).toEqual({ prNumber: '1350', timeoutMs: 2000 });
  });

  it.each([[[]], [['abc']], [['0']], [['-3']]])(
    'rejects a missing or malformed PR number %j',
    (rest) => {
      expect(() => service.parse([...PREFIX, ...rest])).toThrow(
        CAPTURE_CODERABBIT_COMMENT_USAGE,
      );
    },
  );

  it.each([
    '--timeout-ms=0',
    '--timeout-ms=',
    '--interval-ms=abc',
    '--settle-ms=0',
    '--settle-ms=x',
    '--nope=1',
    'extra',
  ])('rejects the argument %s', (arg) => {
    expect(() => service.parse([...PREFIX, '1350', arg])).toThrow(
      CAPTURE_CODERABBIT_COMMENT_USAGE,
    );
  });

  it('rejects an interval below one second', () => {
    expect(() =>
      service.parse([...PREFIX, '1350', '--interval-ms=999']),
    ).toThrow('--interval-ms must be at least 1000');
  });
});
