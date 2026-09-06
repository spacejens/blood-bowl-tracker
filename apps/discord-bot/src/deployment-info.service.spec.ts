import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

import { execFileSync } from 'node:child_process';

import { DeploymentInfoService } from './deployment-info.service';
import { MAX_DESCRIPTION_LENGTH } from './description-limits';

describe('DeploymentInfoService', () => {
  let configService: MockProxy<ConfigService>;
  let service: DeploymentInfoService;

  /** Builds a config mock whose `get` answers from a plain record. */
  function withEnv(env: Record<string, string>): void {
    vi.mocked(configService.get).mockImplementation((key: string) => env[key]);
  }

  /**
   * Stubs `git` per exact argument vector, e.g. `'rev-parse HEAD'`. Any
   * invocation not listed throws, which is what the service sees when a
   * `git` command fails — so an unlisted command means "this one fails".
   */
  function gitReturns(outputs: Record<string, string>): void {
    vi.mocked(execFileSync).mockImplementation((_cmd, args) => {
      const argv = (args as string[]).join(' ');
      const output = outputs[argv];
      if (output === undefined) throw new Error(`git ${argv} failed`);
      return output;
    });
  }

  beforeEach(async () => {
    vi.mocked(execFileSync).mockReset();
    configService = mock<ConfigService>();
    withEnv({});

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeploymentInfoService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = moduleRef.get(DeploymentInfoService);
  });

  it('prefers the env vars over shelling out to git', () => {
    withEnv({
      FLY_MACHINE_ID: '148e123456',
      FLY_APP_NAME: 'blood-bowl-tracker-discord-bot',
      GIT_SHA: 'abcdef1234567890',
      GIT_BRANCH: 'main',
      GIT_COMMIT_MESSAGE: 'Add the thing\n',
      GIT_COMMIT_TIMESTAMP: '2026-08-30T16:05:22+02:00',
      GIT_IS_MERGE_COMMIT: 'false',
    });

    expect(service.getDeploymentInfo()).toEqual({
      machineId: '148e123456',
      appName: 'blood-bowl-tracker-discord-bot',
      branch: 'main',
      commitSha: 'abcdef1234567890',
      commitMessage: 'Add the thing',
      commitTimestamp: '2026-08-30T16:05:22+02:00',
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('falls back to git when the build-time env vars are absent', () => {
    gitReturns({
      'branch --show-current': 'my-branch\n',
      'rev-parse HEAD': 'fedcba9876543210\n',
      'log -1 --pretty=%B': 'Tidy up the importer\n',
      'log -1 --format=%cI': '2026-08-30T14:05:22+00:00\n',
    });

    expect(service.getDeploymentInfo()).toEqual({
      branch: 'my-branch',
      commitSha: 'fedcba9876543210',
      commitMessage: 'Tidy up the importer',
      commitTimestamp: '2026-08-30T14:05:22+00:00',
    });
  });

  it('omits the git-derived fields when git fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.getDeploymentInfo()).toEqual({});
  });

  it('prefers GIT_COMMIT_TIMESTAMP over the git committer-date lookup', () => {
    withEnv({ GIT_COMMIT_TIMESTAMP: '  2026-08-30T16:05:22+02:00  ' });
    gitReturns({ 'log -1 --format=%cI': '1999-01-01T00:00:00+00:00\n' });

    expect(service.getDeploymentInfo().commitTimestamp).toBe(
      '2026-08-30T16:05:22+02:00',
    );
    expect(execFileSync).not.toHaveBeenCalledWith(
      'git',
      ['log', '-1', '--format=%cI'],
      expect.anything(),
    );
  });

  it('omits the commit timestamp when neither the env var nor git answers', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.getDeploymentInfo().commitTimestamp).toBeUndefined();
  });

  it('shows a merge commit body line instead of its subject', () => {
    withEnv({
      GIT_COMMIT_MESSAGE:
        'Merge pull request #551 from spacejens/some-branch\n\nShow team records on the standings page\n',
      GIT_IS_MERGE_COMMIT: 'true',
    });

    expect(service.getDeploymentInfo().commitMessage).toBe(
      'Show team records on the standings page',
    );
  });

  it('shows the subject of a merge commit that has no body', () => {
    withEnv({
      GIT_COMMIT_MESSAGE: 'Merge branch main into my-branch\n',
      GIT_IS_MERGE_COMMIT: 'true',
    });

    expect(service.getDeploymentInfo().commitMessage).toBe(
      'Merge branch main into my-branch',
    );
  });

  it('shows the subject of a non-merge commit that has a body', () => {
    withEnv({
      GIT_COMMIT_MESSAGE:
        'Add team records\n\nWhy: the standings page needed them.\n',
      GIT_IS_MERGE_COMMIT: 'false',
    });

    expect(service.getDeploymentInfo().commitMessage).toBe('Add team records');
  });

  it('treats a successful second-parent lookup as a merge commit', () => {
    gitReturns({
      'log -1 --pretty=%B':
        'Merge pull request #551 from spacejens/some-branch\n\nShow team records\n',
      'rev-parse --verify --quiet HEAD^2': '1111111111111111\n',
    });

    expect(service.getDeploymentInfo().commitMessage).toBe('Show team records');
  });

  it('omits the commit message when the raw value is blank', () => {
    withEnv({ GIT_COMMIT_MESSAGE: '   \n\n', GIT_IS_MERGE_COMMIT: 'false' });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.getDeploymentInfo().commitMessage).toBeUndefined();
  });

  it('resolves once and reuses the result on later calls', () => {
    gitReturns({
      'branch --show-current': 'main\n',
      'rev-parse HEAD': 'deadbeef\n',
      'log -1 --pretty=%B': 'Add the thing\n',
      'log -1 --format=%cI': '2026-08-30T14:05:22+00:00\n',
    });

    service.getDeploymentInfo();
    service.getDeploymentInfo();

    // Branch, SHA, message, and commit timestamp — on the first call only.
    // The commit message has no body line, so the merge check is never
    // reached.
    expect(execFileSync).toHaveBeenCalledTimes(4);
  });

  it('describes an active machine as an embed with one line per field', () => {
    withEnv({
      FLY_MACHINE_ID: '148e123456',
      FLY_APP_NAME: 'blood-bowl-tracker-discord-bot',
      GIT_SHA: 'abcdef1234567890',
      GIT_BRANCH: 'main',
      GIT_COMMIT_MESSAGE:
        'Merge pull request #551 from spacejens/some-branch\n\nShow team records\n',
      GIT_COMMIT_TIMESTAMP: '2026-08-30T16:05:22+02:00',
      GIT_IS_MERGE_COMMIT: 'true',
    });

    expect(service.describe('active')).toEqual({
      embeds: [
        {
          title: 'Bot starting as active',
          description: [
            'Machine: 148e123456',
            'App: blood-bowl-tracker-discord-bot',
            'Branch: main',
            'Commit: abcdef1',
            'Committed: 2026-08-30 14:05 UTC',
            '',
            'Show team records',
          ].join('\n'),
        },
      ],
    });
  });

  it('describes a standby machine with only the fields it has', () => {
    withEnv({ GIT_BRANCH: 'main' });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.describe('standby')).toEqual({
      embeds: [
        { title: 'Bot starting as standby', description: 'Branch: main' },
      ],
    });
  });

  it('omits the description when no field resolves', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.describe('active')).toEqual({
      embeds: [{ title: 'Bot starting as active' }],
    });
  });

  it('truncates the description when it exceeds the Discord limit', () => {
    const longCommitMessage = 'x'.repeat(5000);
    withEnv({
      GIT_BRANCH: 'main',
      GIT_COMMIT_MESSAGE: longCommitMessage,
      GIT_IS_MERGE_COMMIT: 'false',
    });

    const { description } = service.describe('active').embeds[0];

    expect(description).toHaveLength(MAX_DESCRIPTION_LENGTH);
    expect(description?.endsWith('…')).toBe(true);
    expect(description?.startsWith('Branch: main\n\nxxx')).toBe(true);
  });

  it('describes only the commit message when no labelled field resolves', () => {
    withEnv({
      GIT_COMMIT_MESSAGE: 'Add team records\n',
      GIT_IS_MERGE_COMMIT: 'false',
    });

    expect(service.describe('active')).toEqual({
      embeds: [
        { title: 'Bot starting as active', description: 'Add team records' },
      ],
    });
  });

  it('renders an already-UTC commit timestamp without shifting it', () => {
    withEnv({ GIT_COMMIT_TIMESTAMP: '2026-08-30T14:05:22Z' });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.describe('active').embeds[0].description).toBe(
      'Committed: 2026-08-30 14:05 UTC',
    );
  });

  it('omits the committed line when the timestamp cannot be parsed', () => {
    withEnv({ GIT_BRANCH: 'main', GIT_COMMIT_TIMESTAMP: 'not-a-date' });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.describe('active')).toEqual({
      embeds: [
        { title: 'Bot starting as active', description: 'Branch: main' },
      ],
    });
  });
});
