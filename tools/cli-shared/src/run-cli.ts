import { INestApplicationContext, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/** Everything a CLI entrypoint supplies that is specific to that tool. */
export interface RunCliOptions<TSubcommand extends string, TArgs> {
  /**
   * Normally `process.argv`; the subcommand is read from index 2. `readArgs`
   * and `dispatch` read any further positional arguments straight off
   * `process.argv` themselves rather than through this array.
   */
  readonly argv: readonly string[];
  /** The tool's full subcommand list, used for validation and usage text. */
  readonly subcommands: readonly TSubcommand[];
  /** The tool's Nest root module. */
  readonly module: Type<unknown>;
  /**
   * Reads the subcommand's arguments. Called synchronously before the Nest
   * context is created, because reading stdin must finish first.
   */
  readonly readArgs: (subcommand: TSubcommand) => TArgs;
  /** Runs the subcommand against the tool's services. */
  readonly dispatch: (
    app: INestApplicationContext,
    subcommand: TSubcommand,
    args: TArgs,
  ) => Promise<unknown>;
}

function readSubcommand<TSubcommand extends string>(
  argv: readonly string[],
  subcommands: readonly TSubcommand[],
): TSubcommand {
  const value = argv[2];
  if (subcommands.includes(value as TSubcommand)) {
    return value as TSubcommand;
  }
  throw new Error(
    `Usage: node dist/main.js <${subcommands.join('|')}>` +
      (value === undefined || value === '' ? '' : ` (got '${value}')`),
  );
}

/**
 * Drives a subcommand CLI: validates the subcommand, reads its arguments,
 * boots a Nest application context, dispatches, and prints the result as
 * JSON on stdout — or `{"error": message}` on stderr with exit code 1.
 */
export async function runCli<TSubcommand extends string, TArgs>(
  options: RunCliOptions<TSubcommand, TArgs>,
): Promise<void> {
  try {
    const subcommand = readSubcommand(options.argv, options.subcommands);
    // Must complete before the Nest context is created — see readArgs.
    const args = options.readArgs(subcommand);
    const app = await NestFactory.createApplicationContext(options.module, {
      logger: false,
    });
    let result: unknown;
    try {
      result = await options.dispatch(app, subcommand, args);
    } finally {
      await app.close();
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ error: message }));
    process.exit(1);
  }
}
