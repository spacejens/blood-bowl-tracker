import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ProcessRunnerService } from '../shared/process-runner.service';
import { DiffHunkMembershipService } from './diff-hunk-membership.service';
import {
  PostReviewQuestionsService,
  ReviewQuestion,
} from './post-review-questions.service';

const HEAD_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

/** Builds a resolved `ProcessRunnerService.run` result. */
function processResult(
  overrides: Partial<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> = {},
) {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    ...overrides,
  };
}

/** A successful head-SHA lookup. */
const HEAD_SHA_RESULT = processResult({ stdout: `${HEAD_SHA}\n` });

/** A successful inline pulls-comments POST. */
function inlinePostedResult(url = 'https://github.com/o/r/pull/1#comment-1') {
  return processResult({ stdout: `${url}\n` });
}

/** A successful top-level issues-comments POST. */
function topLevelPostedResult(
  url = 'https://github.com/o/r/pull/1#issuecomment-1',
) {
  return processResult({ stdout: `${url}\n` });
}

const QUESTION: ReviewQuestion = {
  file: 'src/foo.ts',
  line: 42,
  body: 'This could be simplified.',
};

describe('PostReviewQuestionsService', () => {
  let service: PostReviewQuestionsService;
  let processRunner: MockProxy<ProcessRunnerService>;
  let diffHunkMembership: MockProxy<DiffHunkMembershipService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    diffHunkMembership = mock<DiffHunkMembershipService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostReviewQuestionsService,
        { provide: ProcessRunnerService, useValue: processRunner },
        { provide: DiffHunkMembershipService, useValue: diffHunkMembership },
      ],
    }).compile();
    service = moduleRef.get(PostReviewQuestionsService);
  });

  it('resolves both arrays empty and calls neither dependency for no questions', async () => {
    const result = await service.run({ prNumber: '5', questions: [] });

    expect(result).toEqual({ posted: [], failed: [] });
    expect(processRunner.run).not.toHaveBeenCalled();
    expect(diffHunkMembership.includesLine).not.toHaveBeenCalled();
  });

  it('posts an in-diff question inline, using the resolved head SHA', async () => {
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockResolvedValueOnce(inlinePostedResult());
    diffHunkMembership.includesLine.mockResolvedValue(true);

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(processRunner.run.mock.calls[0]).toEqual([
      'gh',
      ['api', 'repos/{owner}/{repo}/pulls/5', '--jq', '.head.sha'],
      expect.any(Number),
    ]);
    expect(processRunner.run.mock.calls[1]).toEqual([
      'gh',
      [
        'api',
        'repos/{owner}/{repo}/pulls/5/comments',
        '-f',
        `commit_id=${HEAD_SHA}`,
        '-f',
        'path=src/foo.ts',
        '-f',
        'side=RIGHT',
        '-F',
        'line=42',
        '-f',
        'body=**Comment by Claude**\n\nThis could be simplified.',
        '--jq',
        '.html_url',
      ],
      expect.any(Number),
    ]);
    expect(diffHunkMembership.includesLine).toHaveBeenCalledWith(
      'src/foo.ts',
      42,
    );
    expect(result).toEqual({
      posted: [
        {
          file: 'src/foo.ts',
          line: 42,
          mode: 'inline',
          url: 'https://github.com/o/r/pull/1#comment-1',
        },
      ],
      failed: [],
    });
  });

  it('posts a not-in-diff question as a top-level comment, without ever calling the pulls-comments path', async () => {
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockResolvedValueOnce(topLevelPostedResult());
    diffHunkMembership.includesLine.mockResolvedValue(false);

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(processRunner.run).toHaveBeenCalledTimes(2);
    const [command, args] = processRunner.run.mock.calls[1];
    expect(command).toBe('gh');
    expect(args[0]).toBe('api');
    expect(args[1]).toBe('repos/{owner}/{repo}/issues/5/comments');
    expect(args.join(' ')).not.toContain('pulls/5/comments');
    const bodyArgIndex = args.indexOf('-f') + 1;
    expect(args[bodyArgIndex]).toContain('**Comment by Claude**');
    expect(args[bodyArgIndex]).toContain('`src/foo.ts:42`');
    expect(args[bodyArgIndex]).toContain('This could be simplified.');

    expect(result).toEqual({
      posted: [
        {
          file: 'src/foo.ts',
          line: 42,
          mode: 'top-level',
          url: 'https://github.com/o/r/pull/1#issuecomment-1',
        },
      ],
      failed: [],
    });
  });

  it('falls back to a top-level comment when the inline attempt returns a 422', async () => {
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockResolvedValueOnce(
        processResult({
          exitCode: 1,
          stderr: 'gh: Validation Failed (HTTP 422)',
        }),
      )
      .mockResolvedValueOnce(topLevelPostedResult());
    diffHunkMembership.includesLine.mockResolvedValue(true);

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(processRunner.run).toHaveBeenCalledTimes(3);
    const [, fallbackArgs] = processRunner.run.mock.calls[2];
    expect(fallbackArgs[1]).toBe('repos/{owner}/{repo}/issues/5/comments');
    expect(result.failed).toEqual([]);
    expect(result.posted).toEqual([
      {
        file: 'src/foo.ts',
        line: 42,
        mode: 'top-level',
        url: 'https://github.com/o/r/pull/1#issuecomment-1',
      },
    ]);
  });

  it('records one failed entry and skips the fallback when the inline attempt fails with HTTP 500', async () => {
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockResolvedValueOnce(
        processResult({
          exitCode: 1,
          stderr: 'gh: Internal Server Error (HTTP 500)',
        }),
      );
    diffHunkMembership.includesLine.mockResolvedValue(true);

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(processRunner.run).toHaveBeenCalledTimes(2);
    expect(result.posted).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].file).toBe('src/foo.ts');
    expect(result.failed[0].line).toBe(42);
    expect(result.failed[0].error).toContain(
      'Internal Server Error (HTTP 500)',
    );
  });

  it('records a failure for one question while a second question in the same input still succeeds', async () => {
    const questionTwo: ReviewQuestion = {
      file: 'src/bar.ts',
      line: 7,
      body: 'Another question.',
    };
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockRejectedValueOnce(new Error('spawn gh ENOENT'))
      .mockResolvedValueOnce(
        inlinePostedResult('https://github.com/o/r/pull/1#comment-2'),
      );
    diffHunkMembership.includesLine.mockResolvedValue(true);

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION, questionTwo],
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toEqual({
      file: 'src/foo.ts',
      line: 42,
      error: 'spawn gh ENOENT',
    });
    expect(result.posted).toEqual([
      {
        file: 'src/bar.ts',
        line: 7,
        mode: 'inline',
        url: 'https://github.com/o/r/pull/1#comment-2',
      },
    ]);
  });

  it('records exactly one failed entry when the fallback also fails after a 422 inline attempt', async () => {
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockResolvedValueOnce(
        processResult({ exitCode: 1, stderr: 'Validation Failed (HTTP 422)' }),
      )
      .mockResolvedValueOnce(
        processResult({ exitCode: 1, stderr: 'gh: something else broke' }),
      );
    diffHunkMembership.includesLine.mockResolvedValue(true);

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toContain('something else broke');
    expect(result.posted).toEqual([]);
  });

  it('routes an otherwise-in-diff question to the top-level fallback when the head-SHA call exits non-zero', async () => {
    processRunner.run
      .mockResolvedValueOnce(
        processResult({ exitCode: 1, stderr: 'not found' }),
      )
      .mockResolvedValueOnce(topLevelPostedResult());
    diffHunkMembership.includesLine.mockResolvedValue(true);

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(diffHunkMembership.includesLine).not.toHaveBeenCalled();
    expect(processRunner.run).toHaveBeenCalledTimes(2);
    const [, args] = processRunner.run.mock.calls[1];
    expect(args[1]).toBe('repos/{owner}/{repo}/issues/5/comments');
    expect(result.failed).toEqual([]);
    expect(result.posted[0].mode).toBe('top-level');
  });

  it('routes to the top-level fallback when the head-SHA stdout is empty or whitespace', async () => {
    processRunner.run
      .mockResolvedValueOnce(processResult({ stdout: '   \n' }))
      .mockResolvedValueOnce(topLevelPostedResult());

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(diffHunkMembership.includesLine).not.toHaveBeenCalled();
    expect(result.posted[0].mode).toBe('top-level');
    expect(result.failed).toEqual([]);
  });

  it('preserves input order across a mixed batch of in-diff, not-in-diff, and failing questions', async () => {
    const inDiffQuestion: ReviewQuestion = {
      file: 'src/a.ts',
      line: 1,
      body: 'A',
    };
    const notInDiffQuestion: ReviewQuestion = {
      file: 'src/b.ts',
      line: 2,
      body: 'B',
    };
    const failingQuestion: ReviewQuestion = {
      file: 'src/c.ts',
      line: 3,
      body: 'C',
    };
    diffHunkMembership.includesLine.mockImplementation((file) =>
      Promise.resolve(file === 'src/a.ts'),
    );
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockResolvedValueOnce(inlinePostedResult('https://example.com/a'))
      .mockResolvedValueOnce(topLevelPostedResult('https://example.com/b'))
      .mockResolvedValueOnce(processResult({ exitCode: 1, stderr: 'boom' }));

    const result = await service.run({
      prNumber: '5',
      questions: [inDiffQuestion, notInDiffQuestion, failingQuestion],
    });

    expect(result.posted.map((posted) => posted.file)).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
    expect(result.failed.map((failed) => failed.file)).toEqual(['src/c.ts']);
  });

  it('omits the url key entirely when a POST returns empty stdout', async () => {
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockResolvedValueOnce(processResult({ stdout: '' }));
    diffHunkMembership.includesLine.mockResolvedValue(true);

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    // toStrictEqual, not toEqual: toEqual treats a missing key and an
    // explicit `url: undefined` as equal, so it would not catch a
    // regression away from the intended omit-the-key behavior.
    expect(result.posted).toStrictEqual([
      { file: 'src/foo.ts', line: 42, mode: 'inline' },
    ]);
  });

  it('routes to the top-level fallback when the head-SHA call rejects', async () => {
    processRunner.run
      .mockRejectedValueOnce(new Error('spawn gh ENOENT'))
      .mockResolvedValueOnce(topLevelPostedResult());

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(diffHunkMembership.includesLine).not.toHaveBeenCalled();
    expect(result.posted[0].mode).toBe('top-level');
    expect(result.failed).toEqual([]);
  });

  it('records a failed entry when the top-level fallback rejects', async () => {
    diffHunkMembership.includesLine.mockResolvedValue(false);
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockRejectedValueOnce(new Error('spawn gh ENOENT'));

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(result.posted).toEqual([]);
    expect(result.failed).toEqual([
      { file: 'src/foo.ts', line: 42, error: 'spawn gh ENOENT' },
    ]);
  });

  it('falls back to a generic message when a rejection carries no stderr and is not an Error', async () => {
    diffHunkMembership.includesLine.mockResolvedValue(false);
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockRejectedValueOnce('not an Error instance');

    const result = await service.run({
      prNumber: '5',
      questions: [QUESTION],
    });

    expect(result.failed).toEqual([
      {
        file: 'src/foo.ts',
        line: 42,
        error: 'failed to post top-level comment',
      },
    ]);
  });

  it('passes a numeric timeout on every gh call', async () => {
    processRunner.run
      .mockResolvedValueOnce(HEAD_SHA_RESULT)
      .mockResolvedValueOnce(inlinePostedResult());
    diffHunkMembership.includesLine.mockResolvedValue(true);

    await service.run({ prNumber: '5', questions: [QUESTION] });

    for (const call of processRunner.run.mock.calls) {
      expect(call[2]).toEqual(expect.any(Number));
    }
  });
});
