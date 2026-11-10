import type { Logger } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

/** The frame shape Nest's logger requires before it prints a string as a stack. */
const STACK_FRAME = /\n[ \t]+at .+:\d+:\d+/;

/**
 * Logs a caught exception the same way at every call site, in the bot and in
 * every library running inside it.
 *
 * Nest's `Logger.error(message, x)` prints a string `x` as a stack only when
 * it looks like one (a newline followed by an indented `at file:line:column`
 * frame); any other string becomes the log context label. So `logError` puts
 * the stack in the second argument only when it looks like a stack, and
 * otherwise appends the detail (the unframed stack text, an Error's message,
 * or the stringified thrown value) to the summary itself.
 *
 * `Logger.warn` has no stack argument at all: any trailing string is taken as
 * the context label. So `logWarn` always appends the detail to the summary
 * and passes a single argument.
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
    logger.error(this.withDetail(summary, error));
  }

  logWarn(logger: Logger, summary: string, error: unknown): void {
    logger.warn(this.withDetail(summary, error));
  }

  private withDetail(summary: string, error: unknown): string {
    const detail =
      error instanceof Error ? error.stack || error.message : String(error);
    return `${summary}: ${detail}`;
  }
}
