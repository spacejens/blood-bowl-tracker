import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from './process-runner.service';

describe('ProcessRunnerService', () => {
  let service: ProcessRunnerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ProcessRunnerService],
    }).compile();
    service = moduleRef.get(ProcessRunnerService);
  });

  it('returns exit code 0 with captured stdout for a successful command', async () => {
    const result = await service.run(process.execPath, [
      '-e',
      'process.stdout.write("hello")',
    ]);

    expect(result).toEqual({ exitCode: 0, stdout: 'hello', stderr: '' });
  });

  it('resolves (rather than throwing) with the exit code for a failing command', async () => {
    const result = await service.run(process.execPath, [
      '-e',
      'process.stderr.write("boom"); process.exit(3)',
    ]);

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe('boom');
    expect(result.stdout).toBe('');
  });

  it('rejects when the command cannot be spawned at all', async () => {
    await expect(
      service.run('definitely-not-a-real-binary-xyz', []),
    ).rejects.toThrow();
  });

  it('resolves with TIMED_OUT_EXIT_CODE (rather than hanging or rejecting) when timeoutMs elapses', async () => {
    const result = await service.run(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 5000)'],
      50,
    );

    expect(result.exitCode).toBe(TIMED_OUT_EXIT_CODE);
  });

  it('does not time out a command that finishes within timeoutMs', async () => {
    const result = await service.run(
      process.execPath,
      ['-e', 'process.stdout.write("hello")'],
      5000,
    );

    expect(result).toEqual({ exitCode: 0, stdout: 'hello', stderr: '' });
  });
});
