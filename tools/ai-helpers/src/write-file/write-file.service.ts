import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
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

    // A surprising symlink must not land the write outside the repo. The
    // intentional `docs/plans -> main checkout` link resolves under
    // `mainRoot`, so it still passes. Validate containment BEFORE creating
    // anything: `mkdirSync(..., { recursive: true })` would otherwise create
    // real directories outside the repo for a multi-segment escaping path
    // before the check below ever runs. `realpathSync` requires an existing
    // path, so walk up from `parent` to the nearest ancestor that already
    // exists (this always terminates at `worktreeRoot` or above, since
    // `worktreeRoot` itself always exists) and check containment there.
    this.assertInside({
      resolvableAncestor: this.nearestExistingAncestor(parent),
      worktreeRoot,
      mainRoot,
      path,
    });

    // No-op when the parent already exists, including when it is a symlink.
    mkdirSync(parent, { recursive: true });

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

  /**
   * Walks up from `start` until it finds a path that already exists on disk.
   * `realpathSync` can only resolve paths that exist, so this finds the
   * deepest ancestor safe to realpath before any directory is created.
   * Always terminates at `worktreeRoot` or above, since that always exists.
   */
  private nearestExistingAncestor(start: string): string {
    let current = start;
    while (!existsSync(current)) {
      const next = dirname(current);
      if (next === current) {
        // Reached the filesystem root without finding anything that exists;
        // this should be unreachable in practice.
        break;
      }
      current = next;
    }
    return current;
  }

  private assertInside(options: {
    resolvableAncestor: string;
    worktreeRoot: string;
    mainRoot: string;
    path: string;
  }): void {
    const { resolvableAncestor, worktreeRoot, mainRoot, path } = options;
    const resolved = realpathSync(resolvableAncestor);
    if (
      !this.isInside(resolved, worktreeRoot) &&
      !this.isInside(resolved, mainRoot)
    ) {
      throw new Error(
        `Refusing to write '${path}': its parent resolves to ` +
          `'${resolved}', which is outside both the worktree ` +
          `('${worktreeRoot}') and the main checkout ('${mainRoot}')`,
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
