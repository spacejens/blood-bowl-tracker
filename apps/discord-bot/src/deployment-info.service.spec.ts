import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

import { execFileSync } from 'node:child_process';

import { DeploymentInfoService } from './deployment-info.service';

describe('DeploymentInfoService', () => {
  let configService: MockProxy<ConfigService>;
  let service: DeploymentInfoService;

  /** Builds a config mock whose `get` answers from a plain record. */
  function withEnv(env: Record<string, string>): void {
    configService.get.mockImplementation((key: string) => env[key]);
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
    });

    expect(service.getDeploymentInfo()).toEqual({
      machineId: '148e123456',
      appName: 'blood-bowl-tracker-discord-bot',
      branch: 'main',
      commitSha: 'abcdef1234567890',
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('falls back to git when the build-time env vars are absent', () => {
    vi.mocked(execFileSync).mockImplementation((_cmd, args) => {
      const argv = args as string[];
      return argv.includes('rev-parse') ? 'fedcba9876543210\n' : 'my-branch\n';
    });

    expect(service.getDeploymentInfo()).toEqual({
      branch: 'my-branch',
      commitSha: 'fedcba9876543210',
    });
  });

  it('omits the git-derived fields when git fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.getDeploymentInfo()).toEqual({});
  });

  it('resolves once and reuses the result on later calls', () => {
    vi.mocked(execFileSync).mockReturnValue('deadbeef\n');

    service.getDeploymentInfo();
    service.getDeploymentInfo();

    // One call for the branch and one for the SHA, on the first call only.
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('describes an active machine with every available field', () => {
    withEnv({
      FLY_MACHINE_ID: '148e123456',
      FLY_APP_NAME: 'blood-bowl-tracker-discord-bot',
      GIT_SHA: 'abcdef1234567890',
      GIT_BRANCH: 'main',
    });

    expect(service.describe('active')).toBe(
      'Bot starting as **active** (machine 148e123456, ' +
        'app blood-bowl-tracker-discord-bot, branch main, commit abcdef1)',
    );
  });

  it('describes a standby machine with only the fields it has', () => {
    withEnv({ GIT_BRANCH: 'main' });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.describe('standby')).toBe(
      'Bot starting as **standby** (branch main)',
    );
  });

  it('describes the role alone when no field resolves', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(service.describe('active')).toBe('Bot starting as **active**');
  });
});
