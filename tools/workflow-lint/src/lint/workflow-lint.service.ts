import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import {
  UsesEntry,
  WorkflowUsesExtractorService,
} from '../extract/workflow-uses-extractor.service';
import { UsesRefClassifierService } from '../uses-ref/uses-ref-classifier.service';

/** DI token carrying the absolute path of the workflows directory to scan. */
export const WORKFLOWS_DIR = Symbol('WORKFLOWS_DIR');

/**
 * `.github/workflows`, resolved from this file's own location (in
 * `tools/workflow-lint/src/lint/` or `tools/workflow-lint/dist/lint/`, so four
 * levels below the repo root either way) rather than the working directory,
 * so the check targets the checkout — or worktree — it was built in.
 */
export const DEFAULT_WORKFLOWS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '.github',
  'workflows',
);

/** How problems name a file: the only directory this tool ever scans. */
const DISPLAY_DIR = '.github/workflows/';

const WORKFLOW_FILE = /\.ya?ml$/;

/** Outcome of one scan; `problems` is empty when every reference is pinned. */
export interface WorkflowLintResult {
  readonly filesChecked: number;
  readonly usesChecked: number;
  readonly problems: readonly string[];
}

/**
 * Checks every workflow file directly in the workflows directory and reports
 * each `uses:` reference that is not pinned to an immutable ref, plus each
 * file that does not parse.
 */
@Injectable()
export class WorkflowLintService {
  constructor(
    @Inject(WORKFLOWS_DIR) private readonly dir: string,
    private readonly extractor: WorkflowUsesExtractorService,
    private readonly classifier: UsesRefClassifierService,
  ) {}

  run(): WorkflowLintResult {
    if (!existsSync(this.dir)) {
      throw new Error(`Workflows directory not found: ${this.dir}`);
    }
    const files = readdirSync(this.dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && WORKFLOW_FILE.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    let usesChecked = 0;
    const problems: string[] = [];
    for (const name of files) {
      const label = DISPLAY_DIR + name;
      let entries: UsesEntry[];
      try {
        entries = this.extractor.extract(
          readFileSync(join(this.dir, name), 'utf8'),
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        problems.push(`${label}: ${message}`);
        continue;
      }
      usesChecked += entries.length;
      for (const entry of entries) {
        if (!this.classifier.isPinned(entry.uses)) {
          problems.push(
            `${label}:${entry.line}: '${entry.uses}' is not pinned to a ` +
              'full 40-character commit SHA',
          );
        }
      }
    }
    return { filesChecked: files.length, usesChecked, problems };
  }
}
