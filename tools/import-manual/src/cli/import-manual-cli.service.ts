import { resolve } from 'node:path';

import type { ImportError } from '@blood-bowl-tracker/import';
import { Inject, Injectable } from '@nestjs/common';

import { BatchRunnerService } from '../batches/batch-runner.service';
import { ManualImportService } from '../import/manual-import.service';
import { MANUAL_DATA_DIR } from './manual-data-dir';

const USAGE =
  'Usage: node dist/main.js apply [<batch>] | ' +
  'mark-applied <batch>... | <data-directory>';

/** The command line a run was given. */
export interface CliInvocation {
  args: string[];
  /** The directory a directory argument is resolved against. */
  cwd: string;
}

/** What main.ts prints, and the exit code it ends with. */
export interface CliOutcome {
  stdout: string[];
  stderr: string[];
  exitCode: number;
}

/**
 * Maps the command line onto a run: `apply` applies every unapplied batch and
 * `apply <batch>` applies exactly that one, `mark-applied <batch>...` records
 * batches without importing them, and any other argument is a directory
 * imported ad hoc, which records nothing.
 */
@Injectable()
export class ImportManualCliService {
  constructor(
    @Inject(MANUAL_DATA_DIR) private readonly dataDir: string,
    private readonly runner: BatchRunnerService,
    private readonly manualImport: ManualImportService,
  ) {}

  async execute(invocation: CliInvocation): Promise<CliOutcome> {
    const [command, ...rest] = invocation.args;
    switch (command) {
      case undefined:
      case '':
        throw new Error(USAGE);
      case 'apply':
        if (rest.length > 1) {
          throw new Error(USAGE);
        }
        return this.apply(rest[0]);
      case 'mark-applied':
        return this.markApplied(rest);
      default:
        return this.runDirectory(resolve(invocation.cwd, command));
    }
  }

  private async apply(batch: string | undefined): Promise<CliOutcome> {
    const outcome = await this.runner.apply({ dataDir: this.dataDir, batch });
    const stdout = [
      ...outcome.skipped.map(
        (name) => `Skipped batch ${name} (already applied).`,
      ),
      ...outcome.applied.map((name) => `Applied batch ${name}.`),
    ];
    if (outcome.failed === undefined) {
      return {
        stdout: [...stdout, this.successLine(outcome.imported)],
        stderr: [],
        exitCode: 0,
      };
    }
    return {
      stdout,
      stderr: [
        ...this.errorLines(outcome.failed.errors),
        `Batch ${outcome.failed.name} was not recorded as applied; later batches were not attempted.`,
        'On a fresh database apply the first batch, run the BBL and TP importers, apply the rest, then run the BBL and TP importers again.',
      ],
      exitCode: 1,
    };
  }

  private async markApplied(names: string[]): Promise<CliOutcome> {
    const outcome = await this.runner.markApplied(names, this.dataDir);
    return {
      stdout: [
        ...outcome.alreadyRecorded.map(
          (name) => `Batch ${name} was already recorded as applied.`,
        ),
        ...outcome.recorded.map(
          (name) => `Recorded batch ${name} as applied, without importing it.`,
        ),
      ],
      stderr: [],
      exitCode: 0,
    };
  }

  private async runDirectory(dir: string): Promise<CliOutcome> {
    const result = await this.manualImport.run(dir);
    return result.success
      ? { stdout: [this.successLine(result.imported)], stderr: [], exitCode: 0 }
      : { stdout: [], stderr: this.errorLines(result.errors), exitCode: 1 };
  }

  private successLine(imported: number): string {
    return `Imported ${imported} record(s) successfully.`;
  }

  private errorLines(errors: ImportError[]): string[] {
    return [
      `Import completed with ${errors.length} errors:`,
      ...errors.map((error) => `  - ${error.message}`),
    ];
  }
}
