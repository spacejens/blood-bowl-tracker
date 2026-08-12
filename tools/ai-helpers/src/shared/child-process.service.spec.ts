import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ChildProcessService } from './child-process.service';

describe('ChildProcessService', () => {
  const makeService = async (): Promise<ChildProcessService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [ChildProcessService],
    }).compile();
    return moduleRef.get(ChildProcessService);
  };

  it('spawns a detached process and returns its pid', async () => {
    const service = await makeService();

    const pid = service.spawnDetached(process.execPath, [
      '-e',
      'setTimeout(() => {}, 5000)',
    ]);

    expect(pid).toBeGreaterThan(0);
    expect(service.kill(pid)).toBe(true);
  });

  it('throws when the command cannot be spawned at all', async () => {
    const service = await makeService();

    expect(() =>
      service.spawnDetached('this-command-does-not-exist-anywhere', []),
    ).toThrow();
  });

  it('kill returns false when the pid no longer exists', async () => {
    const service = await makeService();
    const pid = service.spawnDetached(process.execPath, ['-e', '']);

    // Poll rather than sleep a fixed interval — a slow CI box could still
    // have this short-lived process alive after any fixed delay, which
    // would fail the assertion below for reasons unrelated to `kill` itself.
    const deadline = Date.now() + 5000;
    let stillAlive = service.kill(pid);
    while (stillAlive) {
      if (Date.now() > deadline) {
        throw new Error(`pid ${pid} did not exit within the test's deadline`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      stillAlive = service.kill(pid);
    }

    expect(stillAlive).toBe(false);
  });

  it('kill rethrows an error that is not the process-already-gone case', async () => {
    const service = await makeService();

    expect(() =>
      service.kill(process.pid, 'NOT-A-REAL-SIGNAL' as NodeJS.Signals),
    ).toThrow();
  });
});
