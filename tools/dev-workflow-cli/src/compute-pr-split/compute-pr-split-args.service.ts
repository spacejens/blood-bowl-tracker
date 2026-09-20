import { Injectable } from '@nestjs/common';

import {
  TaskCheckpoint,
  taskCheckpointsSchema,
} from './pr-split-checkpoints.schema';

/** Shared with `main.ts`'s pre-Nest stdin gate, so both failure paths report identical wording. */
export const COMPUTE_PR_SPLIT_USAGE =
  'Usage: node dist/main.js compute-pr-split ' +
  '[--base-ref=origin/main] [--head-ref=HEAD] ' +
  '(a JSON array of {taskNumber, sectionPath, commitSha} checkpoints is ' +
  'read from stdin)';

export interface ComputePrSplitInput {
  /** What part 1 of the split would be based on. */
  readonly baseRef: string;
  /**
   * The branch tip. Distinct from the last checkpoint's commit because
   * self-review fix commits land after the final task's commit.
   */
  readonly headRef: string;
  readonly checkpoints: readonly TaskCheckpoint[];
}

/**
 * Turns `compute-pr-split`'s argv and stdin into its input object. Split out
 * of `main.ts` so the parsing and its validation are unit-testable — argv and
 * stdin come in as parameters rather than being read from `process` here.
 */
@Injectable()
export class ComputePrSplitArgsService {
  parse(argv: readonly string[], stdin: string): ComputePrSplitInput {
    const flags = argv.slice(3);
    const known = ['--base-ref=', '--head-ref='];
    if (
      flags.some((flag) => !known.some((prefix) => flag.startsWith(prefix)))
    ) {
      throw new Error(COMPUTE_PR_SPLIT_USAGE);
    }
    const baseRef = this.readFlag(flags, 'base-ref') ?? 'origin/main';
    const headRef = this.readFlag(flags, 'head-ref') ?? 'HEAD';

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdin);
    } catch {
      throw new Error(`${COMPUTE_PR_SPLIT_USAGE} (bad JSON)`);
    }

    const checkpoints = taskCheckpointsSchema.safeParse(parsed);
    if (!checkpoints.success) {
      throw new Error(`${COMPUTE_PR_SPLIT_USAGE} (unexpected shape)`);
    }

    return { baseRef, headRef, checkpoints: checkpoints.data };
  }

  /** Reads `--<name>=<value>`; undefined when absent, an error when empty. */
  private readFlag(flags: readonly string[], name: string): string | undefined {
    const prefix = `--${name}=`;
    const flag = flags.find((arg) => arg.startsWith(prefix));
    if (flag === undefined) {
      return undefined;
    }
    const value = flag.slice(prefix.length);
    if (value === '') {
      throw new Error(`${COMPUTE_PR_SPLIT_USAGE} (empty --${name} value)`);
    }
    return value;
  }
}
