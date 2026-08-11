import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, sep } from 'node:path';

import { Injectable } from '@nestjs/common';

import { GitRootsService } from '../shared/git-roots.service';

/** Outcome of a single `write-file` run. */
export interface WriteFileResult {
  /** The repo-relative path that was passed in, echoed back. */
  readonly written: string;
  /** Size of the written content in bytes (UTF-8). */
  readonly bytes: number;
}

/**
 * Writes a file at a repo-relative path using plain `fs` calls, from a separate
 * OS process. This exists because the Claude Code harness's Write tool refuses
 * to write through the `docs/plans` symlink a worktree has pointing at the main
 * checkout — it looks like escaping the worktree. The OS follows symlinked
 * parent directories transparently, so no symlink-resolution logic is needed
 * here; the checks below only keep the write inside the repo.
 */
@Injectable()
export class WriteFileService {
  constructor(private readonly gitRoots: GitRootsService) {}

  async run(path: string, content: string): Promise<WriteFileResult> {
    this.validate(path);

    const { mainRoot, worktreeRoot } = await this.gitRoots.resolve();
    const target = join(worktreeRoot, path);
    const parent = dirname(target);

    // No-op when the parent already exists, including when it is a symlink.
    mkdirSync(parent, { recursive: true });

    // Defense in depth: a surprising symlink must not land the write outside
    // the repo. The intentional `docs/plans -> main checkout` link resolves
    // under `mainRoot`, so it still passes.
    const resolvedParent = realpathSync(parent);
    if (
      !this.isInside(resolvedParent, worktreeRoot) &&
      !this.isInside(resolvedParent, mainRoot)
    ) {
      throw new Error(
        `Refusing to write '${path}': its parent resolves to ` +
          `'${resolvedParent}', which is outside both the worktree ` +
          `('${worktreeRoot}') and the main checkout ('${mainRoot}')`,
      );
    }

    writeFileSync(target, content, 'utf8');

    return { written: path, bytes: Buffer.byteLength(content, 'utf8') };
  }

  private validate(path: string): void {
    if (path.trim() === '') {
      throw new Error('Refusing to write: no path given');
    }
    if (isAbsolute(path)) {
      throw new Error(
        `Refusing to write absolute path '${path}': pass a repo-relative path`,
      );
    }
    if (path.split(/[\\/]/).includes('..')) {
      throw new Error(
        `Refusing to write '${path}': paths containing '..' are not allowed`,
      );
    }
  }

  private isInside(candidate: string, root: string): boolean {
    // Both sides go through realpath: on macOS the temp/repo roots themselves
    // may sit behind symlinks (/var -> /private/var), so comparing a real path
    // against a raw root would reject legitimate writes.
    const base = realpathSync(root);
    return candidate === base || candidate.startsWith(base + sep);
  }
}
