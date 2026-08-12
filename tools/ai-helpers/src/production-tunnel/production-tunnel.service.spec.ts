import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ChildProcessService } from '../shared/child-process.service';
import { GitRootsService } from '../shared/git-roots.service';
import { ProductionTunnelService } from './production-tunnel.service';

describe('ProductionTunnelService', () => {
  let service: ProductionTunnelService;
  let childProcess: MockProxy<ChildProcessService>;
  let gitRoots: MockProxy<GitRootsService>;
  let worktreeRoot: string;
  let pidFilePath: string;

  beforeEach(async () => {
    worktreeRoot = mkdtempSync(join(tmpdir(), 'production-tunnel-'));
    pidFilePath = join(
      worktreeRoot,
      '.superpowers/deploy-production/tunnel.pid',
    );

    childProcess = mock<ChildProcessService>();
    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot: worktreeRoot,
      worktreeRoot,
      isWorktree: false,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductionTunnelService,
        { provide: ChildProcessService, useValue: childProcess },
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(ProductionTunnelService);
  });

  afterEach(() => {
    rmSync(worktreeRoot, { recursive: true, force: true });
  });

  describe('start', () => {
    it('spawns flyctl proxy with the local:remote mapping and persists the pid', async () => {
      childProcess.spawnDetached.mockReturnValue(12345);

      const result = await service.start(3001, 3000);

      expect(childProcess.spawnDetached).toHaveBeenCalledWith('flyctl', [
        'proxy',
        '3001:3000',
      ]);
      expect(result).toEqual({ pid: 12345 });
      expect(readFileSync(pidFilePath, 'utf8')).toBe('12345');
    });

    it('creates the pid file directory when it does not exist yet', async () => {
      childProcess.spawnDetached.mockReturnValue(999);

      await service.start(3001, 3000);

      expect(readFileSync(pidFilePath, 'utf8')).toBe('999');
    });

    it('kills the spawned process and rethrows when the pid cannot be persisted', async () => {
      // Make the pid file's own path a directory instead of a writable file,
      // so writeFileSync throws EISDIR — a real, portable failure mode
      // rather than a mocked one.
      mkdirSync(pidFilePath, { recursive: true });
      childProcess.spawnDetached.mockReturnValue(555);

      await expect(service.start(3001, 3000)).rejects.toThrow();

      expect(childProcess.kill).toHaveBeenCalledWith(555);
    });
  });

  describe('stop', () => {
    it('kills the persisted pid and removes the pid file', async () => {
      mkdirSync(dirname(pidFilePath), { recursive: true });
      writeFileSync(pidFilePath, '12345', 'utf8');
      childProcess.kill.mockReturnValue(true);

      const result = await service.stop();

      expect(childProcess.kill).toHaveBeenCalledWith(12345);
      expect(result).toEqual({ stopped: true });
      expect(existsSync(pidFilePath)).toBe(false);
    });

    it('reports stopped: false when no pid file exists — nothing to stop', async () => {
      const result = await service.stop();

      expect(childProcess.kill).not.toHaveBeenCalled();
      expect(result).toEqual({ stopped: false });
    });

    it('reports stopped: false when the persisted process is already gone', async () => {
      mkdirSync(dirname(pidFilePath), { recursive: true });
      writeFileSync(pidFilePath, '12345', 'utf8');
      childProcess.kill.mockReturnValue(false);

      const result = await service.stop();

      expect(result).toEqual({ stopped: false });
    });

    it('reports stopped: false and never signals anything when the pid file is corrupted', async () => {
      mkdirSync(dirname(pidFilePath), { recursive: true });
      writeFileSync(pidFilePath, 'not-a-pid', 'utf8');

      const result = await service.stop();

      expect(childProcess.kill).not.toHaveBeenCalled();
      expect(result).toEqual({ stopped: false });
    });

    it('never signals anything for an empty pid file — Number("") is 0, which targets the whole process group', async () => {
      mkdirSync(dirname(pidFilePath), { recursive: true });
      writeFileSync(pidFilePath, '', 'utf8');

      const result = await service.stop();

      expect(childProcess.kill).not.toHaveBeenCalled();
      expect(result).toEqual({ stopped: false });
    });

    it('never signals anything for a negative pid — that targets every process the caller can signal', async () => {
      mkdirSync(dirname(pidFilePath), { recursive: true });
      writeFileSync(pidFilePath, '-1', 'utf8');

      const result = await service.stop();

      expect(childProcess.kill).not.toHaveBeenCalled();
      expect(result).toEqual({ stopped: false });
    });
  });
});
