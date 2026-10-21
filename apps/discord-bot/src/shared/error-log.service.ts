import type { Logger } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

/** The frame shape Nest's logger requires before it prints a string as a stack. */
const STACK_FRAME = /\n[ \t]+at .+:\d+:\d+/;

/**
 * Logs an unexpected exception at error level, the same way at every call
 * site. Nest's `Logger.error(message, x)` prints a string `x` as a stack
 * only when it looks like one (a newline followed by an indented
 * `at file:line:column` frame); any other string becomes the log context
 * label. So the stack goes in the second argument only when it looks like a
 * stack, and otherwise the detail (the unframed stack text, an Error's
 * message, or the stringified thrown value) is appended to the summary
 * itself.
 *
 * The caller passes its own `Logger`, so the log context stays the class
 * that caught the error.
 */
@Injectable()
export class ErrorLogService {
  logError(logger: Logger, summary: string, error: unknown): void {
    if (
      error instanceof Error &&
      error.stack &&
      STACK_FRAME.test(error.stack)
    ) {
      logger.error(summary, error.stack);
      return;
    }
    const detail =
      error instanceof Error ? error.stack || error.message : String(error);
    logger.error(`${summary}: ${detail}`);
  }
}
