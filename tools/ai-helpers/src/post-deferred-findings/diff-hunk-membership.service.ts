import { Injectable } from '@nestjs/common';

import { ProcessRunnerService } from '../shared/process-runner.service';

/**
 * Timeout for git diff operations, in milliseconds.
 * Diff is normally fast, but a large file against many commits can accumulate time.
 */
const DIFF_TIMEOUT_MS = 30_000;

/**
 * Regex matching unified-diff hunk headers at line start.
 * Groups:
 * 1. Old file start line
 * 2. Old file range length (omitted if absent)
 * 3. New file start line
 * 4. New file range length (omitted if absent)
 * Trailing section-heading text (after @@) is allowed and ignored.
 */
const HUNK_HEADER_REGEX = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

@Injectable()
export class DiffHunkMembershipService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  async includesLine(file: string, line: number): Promise<boolean> {
    const result = await this.processRunner.run(
      'git',
      ['diff', 'origin/main...HEAD', '--', file],
      DIFF_TIMEOUT_MS,
    );

    // Non-zero exit code means no diff; fail closed to the harmless top-level fallback.
    if (result.exitCode !== 0) {
      return false;
    }

    const lines = result.stdout.split('\n');
    for (const diffLine of lines) {
      const match = diffLine.match(HUNK_HEADER_REGEX);
      if (!match) {
        continue;
      }

      const newStart = parseInt(match[2], 10);
      // If new length is omitted, it defaults to 1; if it's 0 (pure deletion), no lines match.
      const newLength = match[3] !== undefined ? parseInt(match[3], 10) : 1;

      if (newLength === 0) {
        continue;
      }

      const newEnd = newStart + newLength;
      if (line >= newStart && line < newEnd) {
        return true;
      }
    }

    return false;
  }
}
