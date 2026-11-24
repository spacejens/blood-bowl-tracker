import type {
  DynamicModule,
  INestApplicationContext,
  Type,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/** Everything a single-run CLI entrypoint supplies that is specific to it. */
export interface RunAppOptions<TOutcome> {
  /** The tool's Nest root module, usually `AppModule.register()`. */
  readonly module: Type<unknown> | DynamicModule;
  /** The tool's work, run against the booted context. */
  readonly run: (app: INestApplicationContext) => Promise<TOutcome>;
  /**
   * Prints the outcome, called after the context is closed. Returns the exit
   * code to end with; `undefined` or 0 means success.
   */
  readonly onOutcome: (outcome: TOutcome) => number | undefined;
  /** Printed before the error when anything fails, e.g. `'Review failed:'`. */
  readonly failureLabel: string;
  /**
   * Exit explicitly with 0 on success. Needed by a tool whose open database
   * socket would otherwise keep the event loop, and so the process, alive.
   */
  readonly exitOnSuccess?: boolean;
}

async function runInContext<TOutcome>(
  options: RunAppOptions<TOutcome>,
): Promise<TOutcome> {
  const app = await NestFactory.createApplicationContext(options.module, {
    logger: false,
    // Without this Nest exits the process itself when a provider throws during
    // initialization, and with logging off that exit prints nothing.
    abortOnError: false,
  });
  try {
    return await options.run(app);
  } finally {
    await app.close();
  }
}

/**
 * Drives a CLI that takes no subcommand: boots a Nest application context
 * with logging off, runs the tool's work, closes the context even when that
 * work throws, then hands the outcome to `onOutcome`. A non-zero code from
 * `onOutcome` ends the process with that code; any failure prints
 * `failureLabel` with the error and exits with status 1.
 *
 * A loose function rather than an `@Injectable()` service on purpose: it runs
 * before any Nest context exists and is what creates one, so DI cannot supply
 * it — CLAUDE.md's "Service vs. loose function", case 3 (bootstrap function).
 */
export async function runApp<TOutcome>(
  options: RunAppOptions<TOutcome>,
): Promise<void> {
  let exitCode: number;
  try {
    exitCode = options.onOutcome(await runInContext(options)) ?? 0;
  } catch (error: unknown) {
    console.error(options.failureLabel, error);
    process.exit(1);
    return;
  }
  if (exitCode !== 0 || options.exitOnSuccess === true) {
    process.exit(exitCode);
  }
}
