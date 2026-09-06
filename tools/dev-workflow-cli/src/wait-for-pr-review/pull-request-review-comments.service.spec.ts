import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { PullRequestReviewCommentsService } from './pull-request-review-comments.service';

describe('PullRequestReviewCommentsService', () => {
  let service: PullRequestReviewCommentsService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PullRequestReviewCommentsService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(PullRequestReviewCommentsService);
  });

  /** A `gh api graphql` invocation that printed the given jq output. */
  function ghResult(stdout: string, exitCode = 0) {
    return { exitCode, stdout, stderr: '' };
  }

  it('reports true when the review carries a genuinely new inline comment', async () => {
    processRunner.run.mockResolvedValue(ghResult('1\n'));

    await expect(
      service.hasGenuineInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBe(true);
  });

  it('reports true when new comments are mixed in among replies', async () => {
    processRunner.run.mockResolvedValue(ghResult('2\n'));

    await expect(
      service.hasGenuineInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBe(true);
  });

  it('reports false when every inline comment is a reply', async () => {
    processRunner.run.mockResolvedValue(ghResult('0\n'));

    await expect(
      service.hasGenuineInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBe(false);
  });

  it('counts only non-reply comments, over a bounded page, by review id', async () => {
    processRunner.run.mockResolvedValue(ghResult('0\n'));

    await service.hasGenuineInlineComments('PRR_kwDO1', 5_000);

    const [command, args, timeoutMs] = processRunner.run.mock.calls[0];
    expect(command).toBe('gh');
    expect(args[0]).toBe('api');
    expect(args[1]).toBe('graphql');
    const joined = args.join(' ');
    expect(joined).toContain('id=PRR_kwDO1');
    expect(joined).toContain('on PullRequestReview');
    expect(joined).toContain('comments(first: 100)');
    expect(joined).toContain('replyTo');
    expect(joined).not.toContain('totalCount');
    expect(args).toContain(
      '[.data.node.comments.nodes[] | select(.replyTo == null)] | length',
    );
    expect(timeoutMs).toBe(5_000);
  });

  it('reports undefined when the lookup exits non-zero', async () => {
    processRunner.run.mockResolvedValue(ghResult('', 1));

    await expect(
      service.hasGenuineInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBeUndefined();
  });

  it('reports undefined when the lookup prints nothing', async () => {
    processRunner.run.mockResolvedValue(ghResult('\n'));

    await expect(
      service.hasGenuineInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBeUndefined();
  });

  it('reports undefined when the lookup prints something unparseable', async () => {
    processRunner.run.mockResolvedValue(ghResult('null\n'));

    await expect(
      service.hasGenuineInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBeUndefined();
  });

  it('reports undefined when the process could not be spawned at all', async () => {
    processRunner.run.mockRejectedValue(new Error('spawn gh ENOENT'));

    await expect(
      service.hasGenuineInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBeUndefined();
  });
});
