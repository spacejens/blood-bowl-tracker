import {
  closeSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, sep } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

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
 * *parent* directories transparently, so no resolution logic is needed for
 * those (e.g. `docs/plans` itself); a symlinked *destination file*, however,
 * is explicitly resolved and validated below before any write touches it.
 */
@Injectable()
export class WriteFileService {
  constructor(private readonly gitRoots: GitRootsService) {}

  async run(path: string, content: string): Promise<WriteFileResult> {
    this.validate(path);
    this.validateContent(path, content);

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

    // If the destination itself already exists as a symlink, don't write
    // through it blindly — a symlink swapped in at `target` (e.g.
    // `docs/plans/spec.md -> /etc/passwd`) would otherwise let a write
    // silently overwrite a file outside the repo. Resolve it and validate
    // containment on the resolved path; a symlink resolving inside the repo
    // (e.g. a deliberate `docs/plans/latest.md -> real-file.md`) is still
    // fine to write through — `writeTarget` becomes that resolved path.
    const writeTarget = this.resolveWriteTarget({
      target,
      worktreeRoot,
      mainRoot,
      path,
    });

    // No-op when the parent already exists, including when it is a symlink.
    mkdirSync(dirname(writeTarget), { recursive: true });

    this.writeNoFollow(writeTarget, content, path);

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

  private validateContent(path: string, content: string): void {
    if (content.trim() === '') {
      throw new Error(
        `Refusing to write '${path}': no content given (empty stdin?)`,
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

  /**
   * If `target` already exists as a symlink, resolves it and validates the
   * resolved path's containment (same rule as `assertInside`), returning the
   * resolved path to write to instead of the symlink itself. A non-symlink
   * `target` (existing file, or nothing there yet) is returned unchanged.
   *
   * Uses `lstatSync` (not `existsSync`, which follows symlinks) to detect a
   * symlink even when it's dangling — otherwise a dangling symlink would
   * skip this check entirely and reach `writeNoFollow`'s `O_NOFOLLOW` open,
   * which fails with an ELOOP message claiming the destination "changed to
   * a symlink during the write," which isn't true: it was a symlink all
   * along. A dangling symlink can't be resolved to judge containment, so it
   * is rejected outright rather than guessed at.
   */
  private resolveWriteTarget(options: {
    target: string;
    worktreeRoot: string;
    mainRoot: string;
    path: string;
  }): string {
    const { target, worktreeRoot, mainRoot, path } = options;
    const stat = lstatSync(target, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isSymbolicLink()) {
      return target;
    }

    let resolved: string;
    try {
      resolved = realpathSync(target);
    } catch (error: unknown) {
      throw new Error(
        `Refusing to write '${path}': it is a symlink that cannot be ` +
          `resolved (dangling or broken)`,
        { cause: error },
      );
    }

    if (
      !this.isInside(resolved, worktreeRoot) &&
      !this.isInside(resolved, mainRoot)
    ) {
      throw new Error(
        `Refusing to write '${path}': it is a symlink to '${resolved}', ` +
          `which is outside both the worktree ('${worktreeRoot}') and the ` +
          `main checkout ('${mainRoot}')`,
      );
    }
    return resolved;
  }

  /**
   * Writes `content` to `writeTarget` without following a symlink at
   * `writeTarget` itself, closing the TOCTOU gap between
   * `resolveWriteTarget` and the write: even if a symlink is swapped in at
   * that exact path after the check runs, the kernel refuses to open through
   * it here (`O_NOFOLLOW`), and this throws instead of silently writing
   * through it. `writeTarget` is never itself a symlink in the legitimate
   * case — `resolveWriteTarget` already followed any symlink chain — so this
   * is pure defense-in-depth against that narrow race, not a normal path.
   */
  private writeNoFollow(
    writeTarget: string,
    content: string,
    path: string,
  ): void {
    let fd: number;
    try {
      fd = openSync(
        writeTarget,
        fsConstants.O_WRONLY |
          fsConstants.O_CREAT |
          fsConstants.O_TRUNC |
          fsConstants.O_NOFOLLOW,
      );
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ELOOP') {
        throw new Error(
          `Refusing to write '${path}': its destination changed to a ` +
            `symlink during the write; rejected to avoid following it ` +
            `outside the repo`,
          { cause: error },
        );
      }
      throw error;
    }
    try {
      writeSync(fd, content, null, 'utf8');
    } finally {
      closeSync(fd);
    }
  }
}
