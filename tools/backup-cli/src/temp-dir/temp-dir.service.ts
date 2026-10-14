import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

/**
 * Runs work inside a fresh temporary directory and removes the directory
 * afterwards, whether the work succeeded or not: these directories hold
 * production dumps, partial or complete.
 */
@Injectable()
export class TempDirService {
  async run<T>(prefix: string, work: (dir: string) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    try {
      return await work(dir);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Cleanup is best effort; it must never mask the run's own outcome,
        // but a leftover production dump is worth surfacing.
        process.stderr.write(
          `Warning: Could not remove temporary directory ${dir}; delete it manually.\n`,
        );
      }
    }
  }
}
