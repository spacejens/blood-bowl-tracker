import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  GitRootsService,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { CheckDriftService } from './check-drift.service';
import { DriftDiffRedactionService } from './drift-diff-redaction.service';

describe('CheckDriftService', () => {
  let service: CheckDriftService;
  let gitRoots: MockProxy<GitRootsService>;
  let processRunner: MockProxy<ProcessRunnerService>;
  let redaction: MockProxy<DriftDiffRedactionService>;
  let fixture: string;
  let mainRoot: string;
  let worktreeRoot: string;

  const writeIn = (root: string, path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content, 'utf8');
  };

  beforeEach(async () => {
    fixture = mkdtempSync(join(tmpdir(), 'check-drift-'));
    mainRoot = join(fixture, 'main');
    worktreeRoot = join(fixture, 'worktree');
    mkdirSync(mainRoot, { recursive: true });
    mkdirSync(worktreeRoot, { recursive: true });

    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot,
      worktreeRoot,
      isWorktree: true,
    });
    processRunner = mock<ProcessRunnerService>();
    // Default: every compared pair is identical.
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    redaction = mock<DriftDiffRedactionService>();
    redaction.redact.mockReturnValue('(redacted)');

    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckDriftService,
        { provide: GitRootsService, useValue: gitRoots },
        { provide: ProcessRunnerService, useValue: processRunner },
        { provide: DriftDiffRedactionService, useValue: redaction },
      ],
    }).compile();
    service = moduleRef.get(CheckDriftService);
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('reports nothing and runs no diffs outside a worktree', async () => {
    gitRoots.resolve.mockResolvedValue({
      mainRoot,
      worktreeRoot: mainRoot,
      isWorktree: false,
    });

    await expect(service.run()).resolves.toEqual({
      drifted: [],
      worktreeOnly: [],
    });
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('ignores a listed file that is absent from the worktree', async () => {
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=main');

    await expect(service.run()).resolves.toEqual({
      drifted: [],
      worktreeOnly: [],
    });
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('reports a worktree-only file with no counterpart in the main checkout', async () => {
    writeIn(worktreeRoot, 'tools/review-match/review-match-config.json5', '{}');

    await expect(service.run()).resolves.toEqual({
      drifted: [],
      worktreeOnly: ['tools/review-match/review-match-config.json5'],
    });
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('omits a file whose two copies are identical', async () => {
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=same');
    writeIn(worktreeRoot, 'apps/discord-bot/.env', 'TOKEN=same');

    await expect(service.run()).resolves.toEqual({
      drifted: [],
      worktreeOnly: [],
    });
  });

  it('reports a drifted file with the redacted diff, not the raw one', async () => {
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=old');
    writeIn(worktreeRoot, 'apps/discord-bot/.env', 'TOKEN=new');
    processRunner.run.mockResolvedValue({
      exitCode: 1,
      stdout: '1c1\n< TOKEN=old\n---\n> TOKEN=new\n',
      stderr: '',
    });
    redaction.redact.mockReturnValue(
      '1c1\n< TOKEN (value changed)\n---\n> TOKEN (value changed)',
    );

    await expect(service.run()).resolves.toEqual({
      drifted: [
        {
          path: 'apps/discord-bot/.env',
          diff: '1c1\n< TOKEN (value changed)\n---\n> TOKEN (value changed)',
        },
      ],
      worktreeOnly: [],
    });
  });

  it('passes the trailing-newline-trimmed diff stdout to the redaction service', async () => {
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=old');
    writeIn(worktreeRoot, 'apps/discord-bot/.env', 'TOKEN=new');
    processRunner.run.mockResolvedValue({
      exitCode: 1,
      stdout: '1c1\n< TOKEN=old\n---\n> TOKEN=new\n',
      stderr: '',
    });

    await service.run();

    expect(redaction.redact).toHaveBeenCalledWith(
      '1c1\n< TOKEN=old\n---\n> TOKEN=new',
    );
  });

  it('does not redact when the two copies are identical', async () => {
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=same');
    writeIn(worktreeRoot, 'apps/discord-bot/.env', 'TOKEN=same');

    await service.run();

    expect(redaction.redact).not.toHaveBeenCalled();
  });

  it('diffs the main checkout copy first so < lines are the main checkout', async () => {
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=old');
    writeIn(worktreeRoot, 'apps/discord-bot/.env', 'TOKEN=new');

    await service.run();

    expect(processRunner.run).toHaveBeenCalledWith('diff', [
      join(mainRoot, 'apps/discord-bot/.env'),
      join(worktreeRoot, 'apps/discord-bot/.env'),
    ]);
  });

  it('checks the production config variants as well as the dev ones', async () => {
    writeIn(worktreeRoot, 'apps/discord-bot/.env.production', 'TOKEN=prod');

    await expect(service.run()).resolves.toEqual({
      drifted: [],
      worktreeOnly: ['apps/discord-bot/.env.production'],
    });
  });

  it('rejects when diff itself fails', async () => {
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=old');
    writeIn(worktreeRoot, 'apps/discord-bot/.env', 'TOKEN=new');
    processRunner.run.mockResolvedValue({
      exitCode: 2,
      stdout: '',
      stderr: 'diff: No such file',
    });

    await expect(service.run()).rejects.toThrow(
      'diff of apps/discord-bot/.env failed (exit 2): diff: No such file',
    );
  });
});
