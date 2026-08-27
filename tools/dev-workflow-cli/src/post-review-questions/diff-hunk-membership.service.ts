import {
  ProcessResult,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

/**
 * Timeout for git diff operations, in milliseconds.
 * Diff is normally fast, but a large file against many commits can accumulate time.
 */
const DIFF_TIMEOUT_MS = 30_000;

/**
 * Regex matching unified-diff hunk headers at line start.
 * The old file's start line is matched but not captured — only its range
 * length is needed here. Groups:
 * 1. Old file range length (omitted if absent)
 * 2. New file start line
 * 3. New file range length (omitted if absent)
 * Trailing section-heading text (after @@) is allowed and ignored.
 */
const HUNK_HEADER_REGEX = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

@Injectable()
export class DiffHunkMembershipService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  async includesLine(file: string, line: number): Promise<boolean> {
    let result: ProcessResult;
    try {
      result = await this.processRunner.run(
        'git',
        ['diff', 'origin/main...HEAD', '--', file],
        DIFF_TIMEOUT_MS,
      );
    } catch {
      // A rejected run (e.g. spawn failure) fails closed the same as a
      // non-zero exit below — one question's membership check must never
      // abort the whole batch in PostReviewQuestionsService.
      return false;
    }

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
