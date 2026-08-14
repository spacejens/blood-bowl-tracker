import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  ProcessResult,
  ProcessRunnerService,
} from '../shared/process-runner.service';
import { DiffHunkMembershipService } from './diff-hunk-membership.service';

describe('DiffHunkMembershipService', () => {
  let service: DiffHunkMembershipService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiffHunkMembershipService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(DiffHunkMembershipService);
  });

  const mkResult = (stdout: string): ProcessResult => ({
    exitCode: 0,
    stdout,
    stderr: '',
  });

  it('line inside a multi-line hunk', async () => {
    const diffOutput = '@@ -1,3 +1,4 @@ section\n';
    processRunner.run.mockResolvedValue(mkResult(diffOutput));

    const result = await service.includesLine('file.ts', 2);

    expect(result).toBe(true);
    expect(processRunner.run).toHaveBeenCalledWith(
      'git',
      ['diff', 'origin/main...HEAD', '--', 'file.ts'],
      expect.any(Number),
    );
  });

  it('line one before the new start', async () => {
    const diffOutput = '@@ -1,3 +5,4 @@\n';
    processRunner.run.mockResolvedValue(mkResult(diffOutput));

    const result = await service.includesLine('file.ts', 4);

    expect(result).toBe(false);
  });

  it('line one past the last covered line', async () => {
    const diffOutput = '@@ -1,3 +5,4 @@\n';
    processRunner.run.mockResolvedValue(mkResult(diffOutput));

    const result = await service.includesLine('file.ts', 9);

    expect(result).toBe(false);
  });

  it('line exactly at the new start', async () => {
    const diffOutput = '@@ -1,3 +5,4 @@\n';
    processRunner.run.mockResolvedValue(mkResult(diffOutput));

    const result = await service.includesLine('file.ts', 5);

    expect(result).toBe(true);
  });

  it('line exactly at the last covered line', async () => {
    const diffOutput = '@@ -1,3 +5,4 @@\n';
    processRunner.run.mockResolvedValue(mkResult(diffOutput));

    const result = await service.includesLine('file.ts', 8);

    expect(result).toBe(true);
  });

  it('header with the new length omitted matching only that one line', async () => {
    const diffOutput = '@@ -1,3 +5 @@\n';
    processRunner.run.mockResolvedValue(mkResult(diffOutput));

    expect(await service.includesLine('file.ts', 5)).toBe(true);
    expect(await service.includesLine('file.ts', 6)).toBe(false);
  });

  it('header with new length zero matching nothing', async () => {
    const diffOutput = '@@ -1,3 +5,0 @@\n';
    processRunner.run.mockResolvedValue(mkResult(diffOutput));

    const result = await service.includesLine('file.ts', 5);

    expect(result).toBe(false);
  });

  it('multi-hunk diff matching inside the second hunk', async () => {
    const diffOutput =
      '@@ -1,3 +1,4 @@\n' + 'content\n' + '@@ -10,2 +15,3 @@\n';
    processRunner.run.mockResolvedValue(mkResult(diffOutput));

    const result = await service.includesLine('file.ts', 16);

    expect(result).toBe(true);
  });

  it('empty stdout', async () => {
    processRunner.run.mockResolvedValue(mkResult(''));

    const result = await service.includesLine('file.ts', 1);

    expect(result).toBe(false);
  });

  it('non-zero exit code with stderr text returning false without throwing', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'some error',
    });

    const result = await service.includesLine('file.ts', 1);

    expect(result).toBe(false);
  });

  it('an indented look-alike header not at line start not being parsed as a hunk', async () => {
    const diffOutput = 'some content\n  @@ -1,3 +1,4 @@\n';
    processRunner.run.mockResolvedValue(mkResult(diffOutput));

    const result = await service.includesLine('file.ts', 1);

    expect(result).toBe(false);
  });
});
