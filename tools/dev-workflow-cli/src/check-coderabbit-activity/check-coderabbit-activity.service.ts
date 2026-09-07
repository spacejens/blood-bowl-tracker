import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

const CHECK_CODERABBIT_ACTIVITY_USAGE =
  'Usage: node dist/main.js check-coderabbit-activity <pr-number>';

/**
 * Answers "has CodeRabbit ever said anything on this PR?" over the PR's whole
 * history — comments and reviews alike. Matches the login case-insensitively
 * by substring, the same way every CodeRabbit-login check in
 * `wait-for-pr-review-filters.service.ts` does, rather than pinning one exact
 * spelling of the bot's account name.
 */
const CODERABBIT_ACTIVITY_JQ =
  '([.comments[]?.author.login, .reviews[]?.author.login] | ' +
  'any(test("coderabbit"; "i")))';

export interface CheckCoderabbitActivityResult {
  readonly hasActivity: boolean;
}

/**
 * Reports whether CodeRabbit has ever posted any comment or review on a pull
 * request, at any point in its history. Deliberately a read-only historical
 * check with no watermark or time window, and deliberately indifferent to
 * *what* the matched item was: any CodeRabbit-authored activity at all means
 * the automatic-review path has engaged with this PR at least once, so no
 * proactive `@coderabbitai review` nudge is needed.
 *
 * `finish-renovate-pr` is the only caller — Renovate opens its PRs under a
 * bot account, which CodeRabbit does not reliably auto-review. Skills working
 * on developer-authored PRs must not nudge unconditionally: that would fire
 * before CodeRabbit's normal automatic review had a chance, spending
 * review-rate-limit budget on PRs that would have been reviewed anyway.
 */
@Injectable()
export class CheckCoderabbitActivityService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  async run(
    prNumber: string | undefined,
  ): Promise<CheckCoderabbitActivityResult> {
    if (prNumber === undefined || !/^[1-9]\d*$/.test(prNumber)) {
      throw new Error(CHECK_CODERABBIT_ACTIVITY_USAGE);
    }

    const result = await this.processRunner.run('gh', [
      'pr',
      'view',
      prNumber,
      '--json',
      'comments,reviews',
      '--jq',
      CODERABBIT_ACTIVITY_JQ,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(
        `gh pr view ${prNumber} failed (exit ${result.exitCode}): ` +
          result.stderr.trim(),
      );
    }

    const printed = result.stdout.trim();
    if (printed !== 'true' && printed !== 'false') {
      // Fail closed rather than guessing: this gates whether a trigger
      // comment gets posted, and an unreadable answer is not a `false`.
      throw new Error(
        `gh pr view ${prNumber} printed unexpected output: '${printed}'`,
      );
    }
    return { hasActivity: printed === 'true' };
  }
}
