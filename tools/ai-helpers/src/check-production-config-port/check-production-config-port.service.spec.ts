import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { GitRootsService } from '../shared/git-roots.service';
import { CheckProductionConfigPortService } from './check-production-config-port.service';

describe('CheckProductionConfigPortService', () => {
  let service: CheckProductionConfigPortService;
  let gitRoots: MockProxy<GitRootsService>;
  let worktreeRoot: string;

  const writeConfig = (path: string, apiBaseUrl: string): void => {
    const fullPath = join(worktreeRoot, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(
      fullPath,
      `{ connection: { apiBaseUrl: '${apiBaseUrl}', apiToken: 'token' } }`,
      'utf8',
    );
  };

  beforeEach(async () => {
    worktreeRoot = mkdtempSync(join(tmpdir(), 'check-production-config-port-'));

    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot: worktreeRoot,
      worktreeRoot,
      isWorktree: false,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckProductionConfigPortService,
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(CheckProductionConfigPortService);
  });

  afterEach(() => {
    rmSync(worktreeRoot, { recursive: true, force: true });
  });

  it('reports nothing stale when every existing config matches the expected apiBaseUrl', async () => {
    writeConfig(
      'tools/import-bbl/import-bbl-config.production.json5',
      'http://localhost:3001',
    );
    writeConfig(
      'tools/import-tp/import-tp-config.production.json5',
      'http://localhost:3001',
    );

    const result = await service.run('http://localhost:3001');

    expect(result.stale).toEqual([]);
  });

  it('reports a config whose apiBaseUrl still names the pre-migration value', async () => {
    writeConfig(
      'tools/import-bbl/import-bbl-config.production.json5',
      'http://localhost:3000',
    );

    const result = await service.run('http://localhost:3001');

    expect(result.stale).toEqual([
      {
        path: 'tools/import-bbl/import-bbl-config.production.json5',
        actualApiBaseUrl: 'http://localhost:3000',
      },
    ]);
  });

  it('ignores a config file that does not exist', async () => {
    const result = await service.run('http://localhost:3001');

    expect(result.stale).toEqual([]);
  });

  it('reports an unparseable config as stale, without aborting the check for the other configs', async () => {
    const badPath = 'tools/import-bbl/import-bbl-config.production.json5';
    mkdirSync(dirname(join(worktreeRoot, badPath)), { recursive: true });
    writeFileSync(join(worktreeRoot, badPath), '{ not valid json5 !!', 'utf8');
    writeConfig(
      'tools/import-tp/import-tp-config.production.json5',
      'http://localhost:3001',
    );

    const result = await service.run('http://localhost:3001');

    expect(result.stale).toHaveLength(1);
    expect(result.stale[0].path).toBe(badPath);
    expect(result.stale[0].actualApiBaseUrl).toBeUndefined();
    expect(result.stale[0].parseError).toBeDefined();
  });

  it('reports a config whose top-level content is not an object as stale, with an undefined apiBaseUrl', async () => {
    const path = 'tools/import-bbl/import-bbl-config.production.json5';
    mkdirSync(dirname(join(worktreeRoot, path)), { recursive: true });
    writeFileSync(join(worktreeRoot, path), 'null', 'utf8');

    const result = await service.run('http://localhost:3001');

    expect(result.stale).toEqual([{ path, actualApiBaseUrl: undefined }]);
  });

  it('reports a config with no connection group as stale, with an undefined apiBaseUrl', async () => {
    const path = 'tools/import-bbl/import-bbl-config.production.json5';
    mkdirSync(dirname(join(worktreeRoot, path)), { recursive: true });
    writeFileSync(join(worktreeRoot, path), '{ dataDir: "data/x" }', 'utf8');

    const result = await service.run('http://localhost:3001');

    expect(result.stale).toEqual([{ path, actualApiBaseUrl: undefined }]);
  });

  it('reports a config whose apiBaseUrl field is missing as stale, with an undefined apiBaseUrl', async () => {
    const path = 'tools/import-bbl/import-bbl-config.production.json5';
    mkdirSync(dirname(join(worktreeRoot, path)), { recursive: true });
    writeFileSync(
      join(worktreeRoot, path),
      '{ connection: { apiToken: "token" } }',
      'utf8',
    );

    const result = await service.run('http://localhost:3001');

    expect(result.stale).toEqual([{ path, actualApiBaseUrl: undefined }]);
  });

  it('reports each stale config independently, without one blocking another', async () => {
    writeConfig(
      'tools/import-bbl/import-bbl-config.production.json5',
      'http://localhost:3000',
    );
    writeConfig(
      'tools/import-tp/import-tp-config.production.json5',
      'http://localhost:3001',
    );
    writeConfig(
      'tools/import-manual/import-manual-config.production.json5',
      'http://localhost:30010',
    );

    const result = await service.run('http://localhost:3001');

    expect(result.stale).toEqual([
      {
        path: 'tools/import-bbl/import-bbl-config.production.json5',
        actualApiBaseUrl: 'http://localhost:3000',
      },
      {
        path: 'tools/import-manual/import-manual-config.production.json5',
        actualApiBaseUrl: 'http://localhost:30010',
      },
    ]);
  });
});
