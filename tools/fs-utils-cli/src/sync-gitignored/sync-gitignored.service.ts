import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  GITIGNORED_AUTO_CREATE_SYMLINK_DIRS,
  GITIGNORED_DATA_DIRS,
  GITIGNORED_SYNC_FILES,
  GitRootsService,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

export interface SyncGitignoredResult {
  /** Repo-relative paths copied from the main checkout into the worktree. */
  readonly copied: readonly string[];
  /** Repo-relative paths symlinked from the worktree to the main checkout. */
  readonly symlinked: readonly string[];
  /**
   * Repo-relative paths left untouched — either already present in the
   * worktree, or absent from the main checkout so there is nothing to take.
   */
  readonly skipped: readonly string[];
}

/**
 * Fills a fresh worktree in with the gitignored dev config the main checkout
 * has. Copy-if-missing only: an existing worktree file or symlink is never
 * overwritten, because a developer may have deliberately set one up
 * differently. The large data directories are symlinked rather than copied,
 * as is `docs/plans` — which is additionally created on the main-checkout
 * side first when it does not exist yet, so plans written in a worktree
 * always survive the worktree's removal. A no-op outside a worktree.
 */
@Injectable()
export class SyncGitignoredService {
  constructor(private readonly gitRoots: GitRootsService) {}

  async run(): Promise<SyncGitignoredResult> {
    const copied: string[] = [];
    const symlinked: string[] = [];
    const skipped: string[] = [];

    const roots = await this.gitRoots.resolve();
    if (!roots.isWorktree) {
      return { copied, symlinked, skipped };
    }

    for (const path of GITIGNORED_SYNC_FILES) {
      const source = join(roots.mainRoot, path);
      const target = join(roots.worktreeRoot, path);
      if (existsSync(target) || !existsSync(source)) {
        skipped.push(path);
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      copied.push(path);
    }

    for (const path of GITIGNORED_DATA_DIRS) {
      const source = join(roots.mainRoot, path);
      const target = join(roots.worktreeRoot, path);
      if (existsSync(target) || !existsSync(source)) {
        skipped.push(path);
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(source, target);
      symlinked.push(path);
    }

    for (const path of GITIGNORED_AUTO_CREATE_SYMLINK_DIRS) {
      const source = join(roots.mainRoot, path);
      const target = join(roots.worktreeRoot, path);
      if (this.isOccupied(target)) {
        skipped.push(path);
        continue;
      }
      mkdirSync(source, { recursive: true });
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(source, target);
      symlinked.push(path);
    }

    return { copied, symlinked, skipped };
  }

  /**
   * True if something already sits at `path` — a real file/directory, or a
   * symlink, even a dangling one. `existsSync` follows symlinks and reports
   * `false` for a dangling one, which would let `symlinkSync` attempt to
   * create over it and fail with `EEXIST`.
   */
  private isOccupied(path: string): boolean {
    return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
  }
}
