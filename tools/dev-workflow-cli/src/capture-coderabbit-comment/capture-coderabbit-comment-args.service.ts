import { Injectable } from '@nestjs/common';

import { CaptureCoderabbitCommentOptions } from './capture-coderabbit-comment.service';

export const CAPTURE_CODERABBIT_COMMENT_USAGE =
  'Usage: node dist/main.js capture-coderabbit-comment <pr-number> ' +
  '[--timeout-ms=1800000] [--interval-ms=10000]';

/** Below this, `--interval-ms` would hammer `gh` in a tight loop. */
const MIN_INTERVAL_MS = 1000;

const FLAG_PATTERN = /^--(timeout-ms|interval-ms)=([1-9]\d*)$/;

/**
 * Turns `capture-coderabbit-comment`'s argv into its options object, kept
 * out of `main.ts` so parsing and validation are unit-testable.
 */
@Injectable()
export class CaptureCoderabbitCommentArgsService {
  parse(argv: readonly string[]): CaptureCoderabbitCommentOptions {
    const prNumber = argv[3];
    if (prNumber === undefined || !/^[1-9]\d*$/.test(prNumber)) {
      throw new Error(CAPTURE_CODERABBIT_COMMENT_USAGE);
    }
    const flags = new Map<string, number>();
    for (const arg of argv.slice(4)) {
      const match = FLAG_PATTERN.exec(arg);
      if (match === null) {
        throw new Error(
          `${CAPTURE_CODERABBIT_COMMENT_USAGE} (unrecognised argument '${arg}')`,
        );
      }
      flags.set(match[1], Number(match[2]));
    }
    const intervalMs = flags.get('interval-ms');
    if (intervalMs !== undefined && intervalMs < MIN_INTERVAL_MS) {
      throw new Error(`--interval-ms must be at least ${MIN_INTERVAL_MS}`);
    }
    const timeoutMs = flags.get('timeout-ms');
    return {
      prNumber,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(intervalMs === undefined ? {} : { intervalMs }),
    };
  }
}
