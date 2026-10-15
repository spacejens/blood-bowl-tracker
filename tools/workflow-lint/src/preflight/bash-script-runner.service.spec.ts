import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BashScriptRunnerService } from './bash-script-runner.service';

describe('BashScriptRunnerService', () => {
  let service: BashScriptRunnerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BashScriptRunnerService],
    }).compile();
    service = moduleRef.get(BashScriptRunnerService);
  });

  it('returns exit status, stdout and stderr', () => {
    const result = service.run('echo out\necho err >&2\nexit 3\n', {});

    expect(result).toEqual({ status: 3, stdout: 'out\n', stderr: 'err\n' });
  });

  it('exposes exactly the given variables, not the calling process environment', () => {
    process.env.WORKFLOW_LINT_RUNNER_LEAK = 'leaked';
    try {
      const result = service.run(
        'echo "[$GIVEN][${WORKFLOW_LINT_RUNNER_LEAK:-}]"',
        { GIVEN: 'value' },
      );

      expect(result.stdout).toBe('[value][]\n');
    } finally {
      delete process.env.WORKFLOW_LINT_RUNNER_LEAK;
    }
  });

  it('stops at the first failing command, like a GitHub Actions run step', () => {
    const result = service.run('false\necho unreachable\n', {});

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('throws when bash cannot be started', () => {
    expect(() => service.run('true', { PATH: '' })).toThrow(/ENOENT/);
  });
});
