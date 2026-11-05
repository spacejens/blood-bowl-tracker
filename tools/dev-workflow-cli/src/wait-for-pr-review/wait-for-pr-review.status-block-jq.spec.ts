import { spawnSync } from 'node:child_process';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { WaitForPrReviewFiltersService } from './wait-for-pr-review-filters.service';

const HEAD_SHA = 'cecd0a9c66c177ef7a9c62db5247684e90c9dcee';
const CLEAN_VERDICT =
  'No actionable comments were generated in the recent review.';

/**
 * A multiline walkthrough body shaped like CodeRabbit's real rolling comment:
 * generated markers, the status block carrying the verdict, a walkthrough,
 * then the `recent_review` section holding the run configuration and the
 * reviewed commit range but no verdict of its own.
 */
function walkthroughBody(statusText: string | undefined): string {
  const statusBlock =
    statusText === undefined
      ? ''
      : `<!-- recent_review_status_start -->\n\n${statusText}\n\n<!-- recent_review_status_end -->\n`;
  return (
    '<!-- coderabbit-ai-generated:v1 -->\n\n' +
    '<!-- This is an auto-generated comment: summarize by coderabbit.ai -->\n' +
    '<!-- review_stack_entry_start -->\n\nChange stack\n\n<!-- review_stack_entry_end -->\n' +
    statusBlock +
    '<!-- walkthrough_start -->\n\n<details>\n<summary>Walkthrough</summary>\n\nChanged files.\n\n</details>\n\n' +
    '<!-- recent_review_start -->\n\n<details>\n<summary>Recent review info</summary>\n\n' +
    '- **Review profile**: CHILL\n\n' +
    `Reviewing files that changed from the base of the PR and between 7ae0bc0133915087668f3631b5073721ddc1df91 and ${HEAD_SHA}.\n\n` +
    '</details>\n\n<!-- recent_review_end -->\n'
  );
}

interface RollingResult {
  readonly completion: {
    readonly id: string;
    readonly submittedAt: string;
    readonly author: { readonly login: string };
    readonly section: string;
    readonly status: string;
  } | null;
  readonly rateLimitEdit: unknown;
}

const JQ_AVAILABLE = spawnSync('jq', ['--version']).status === 0;

/**
 * Runs the generated rolling-comment jq program through the real `jq` binary
 * — the unit tests elsewhere only inspect the program text or mock its
 * output, so only this exercises the capture patterns against a raw body.
 * Skipped where `jq` is not installed.
 */
describe.skipIf(!JQ_AVAILABLE)(
  'WaitForPrReviewFiltersService rolling-comment program against a raw body',
  () => {
    let program: string;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [WaitForPrReviewFiltersService],
      }).compile();
      program = moduleRef.get(WaitForPrReviewFiltersService).rollingComment({
        prNumber: '1320',
        developerLogin: 'someone',
        sinceEpochSeconds: 0,
      });
    });

    function evaluate(body: string): RollingResult {
      const comments = [
        {
          id: 6637445153,
          user: { login: 'coderabbitai[bot]' },
          updated_at: '2026-11-04T18:18:16Z',
          body,
        },
      ];
      const result = spawnSync('jq', ['-c', program], {
        input: JSON.stringify(comments),
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      return JSON.parse(result.stdout) as RollingResult;
    }

    it('emits the status block and the recent_review section of a clean pass', () => {
      const { completion, rateLimitEdit } = evaluate(
        walkthroughBody(CLEAN_VERDICT),
      );

      expect(rateLimitEdit).toBeNull();
      expect(completion).not.toBeNull();
      expect(completion?.id).toMatch(/^6637445153@\d+$/);
      expect(completion?.submittedAt).toBe('2026-11-04T18:18:16Z');
      expect(completion?.author).toEqual({ login: 'coderabbitai[bot]' });
      expect(completion?.status.trim()).toBe(CLEAN_VERDICT);
      expect(completion?.section).toContain(HEAD_SHA);
      expect(completion?.section).not.toContain(CLEAN_VERDICT);
    });

    it('emits nothing when the status block reports findings', () => {
      const { completion } = evaluate(
        walkthroughBody('Actionable comments posted: 2'),
      );

      expect(completion).toBeNull();
    });

    it('emits a candidate with an empty status when only the section carries the verdict', () => {
      const body = walkthroughBody(undefined).replace(
        'Reviewing files that changed',
        `${CLEAN_VERDICT}\n\nReviewing files that changed`,
      );

      const { completion } = evaluate(body);

      expect(completion).not.toBeNull();
      expect(completion?.status).toBe('');
      expect(completion?.section).toContain(CLEAN_VERDICT);
      expect(completion?.section).toContain(HEAD_SHA);
    });

    it('emits nothing when there is no status block and the section carries no verdict', () => {
      const { completion } = evaluate(walkthroughBody(undefined));

      expect(completion).toBeNull();
    });
  },
);
