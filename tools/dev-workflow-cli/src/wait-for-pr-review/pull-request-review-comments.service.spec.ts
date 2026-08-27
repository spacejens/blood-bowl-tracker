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

  it('reports true when the review carries inline comments', async () => {
    processRunner.run.mockResolvedValue(ghResult('3\n'));

    await expect(service.hasInlineComments('PRR_kwDO1', 5_000)).resolves.toBe(
      true,
    );
  });

  it('reports false when the review carries no inline comments', async () => {
    processRunner.run.mockResolvedValue(ghResult('0\n'));

    await expect(service.hasInlineComments('PRR_kwDO1', 5_000)).resolves.toBe(
      false,
    );
  });

  it('queries the review node by id, bounded by the given timeout', async () => {
    processRunner.run.mockResolvedValue(ghResult('0\n'));

    await service.hasInlineComments('PRR_kwDO1', 5_000);

    const [command, args, timeoutMs] = processRunner.run.mock.calls[0];
    expect(command).toBe('gh');
    expect(args[0]).toBe('api');
    expect(args[1]).toBe('graphql');
    expect(args.join(' ')).toContain('id=PRR_kwDO1');
    expect(args.join(' ')).toContain('on PullRequestReview');
    expect(args).toContain('.data.node.comments.totalCount');
    expect(timeoutMs).toBe(5_000);
  });

  it('reports undefined when the lookup exits non-zero', async () => {
    processRunner.run.mockResolvedValue(ghResult('', 1));

    await expect(
      service.hasInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBeUndefined();
  });

  it('reports undefined when the lookup prints nothing', async () => {
    processRunner.run.mockResolvedValue(ghResult('\n'));

    await expect(
      service.hasInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBeUndefined();
  });

  it('reports undefined when the lookup prints something unparseable', async () => {
    processRunner.run.mockResolvedValue(ghResult('null\n'));

    await expect(
      service.hasInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBeUndefined();
  });

  it('reports undefined when the process could not be spawned at all', async () => {
    processRunner.run.mockRejectedValue(new Error('spawn gh ENOENT'));

    await expect(
      service.hasInlineComments('PRR_kwDO1', 5_000),
    ).resolves.toBeUndefined();
  });
});
