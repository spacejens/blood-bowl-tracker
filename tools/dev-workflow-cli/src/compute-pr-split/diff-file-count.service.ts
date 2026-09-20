import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import { PR_SPLIT_DIFF_PATHSPECS } from './pr-split-limit';

/**
 * Counts the files a PR would show for a commit range — the same number
 * CodeRabbit measures against its own file limit.
 *
 * The range is always three-dot (`from...to`, i.e. from their merge base),
 * because that is what GitHub shows for a PR whose base is `from`. Within one
 * branch, where every part boundary is an ancestor of the next, three-dot and
 * two-dot ranges are identical, so one form serves both the total check
 * against `origin/main` and each incremental part measurement.
 */
@Injectable()
export class DiffFileCountService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  async count(fromRef: string, toRef: string): Promise<number> {
    const range = `${fromRef}...${toRef}`;
    const result = await this.processRunner.run('git', [
      'diff',
      '--name-only',
      range,
      '--',
      ...PR_SPLIT_DIFF_PATHSPECS,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(
        `git diff ${range} failed (exit ${String(result.exitCode)}): ` +
          result.stderr.trim(),
      );
    }
    return result.stdout.split('\n').filter((line) => line.trim() !== '')
      .length;
  }
}
