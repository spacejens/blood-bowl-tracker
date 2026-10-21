import type { Logger } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

/**
 * Logs an unexpected exception at error level, the same way at every call
 * site. Nest's `Logger.error(message, x)` prints a string `x` as a stack
 * only when it looks like one; any other string becomes the log context
 * label. So the stack goes in the second argument only when there is one,
 * and otherwise the detail (an Error's message, or the stringified thrown
 * value) is appended to the summary itself.
 *
 * The caller passes its own `Logger`, so the log context stays the class
 * that caught the error.
 */
@Injectable()
export class ErrorLogService {
  logError(logger: Logger, summary: string, error: unknown): void {
    if (error instanceof Error && error.stack) {
      logger.error(summary, error.stack);
      return;
    }
    const detail = error instanceof Error ? error.message : String(error);
    logger.error(`${summary}: ${detail}`);
  }
}
