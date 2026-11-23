import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix, sep } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';
import { z } from 'zod';

/** The manual-import batches, committed; one directory per batch. */
export const MANUAL_BATCHES_DIR = 'tools/import-manual/data/batches';

const batchFillsSchema = z.object({
  incompletePlayerFills: z
    .array(
      z.object({ player: z.object({ system: z.string(), id: z.string() }) }),
    )
    .optional(),
});

/**
 * The TP players the committed manual-import batches fill, so the fill
 * generator can count a player an earlier batch fills as complete on a
 * database built from scratch. Reads this checkout's batches.
 */
@Injectable()
export class ManualBatchFillsStoreService {
  private root?: Promise<string>;

  constructor(private readonly gitRoots: GitRootsService) {}

  /**
   * The batch a repo-relative `--out` path writes into: its directory
   * directly under the batches directory, or undefined for a path elsewhere.
   */
  batchOf(out: string): string | undefined {
    const parts = posix.normalize(out.split(sep).join('/')).split('/');
    const base = MANUAL_BATCHES_DIR.split('/');
    const inside =
      parts.length > base.length + 1 &&
      base.every((part, index) => parts[index] === part);
    return inside ? parts[base.length] : undefined;
  }

  /**
   * The `tourplay.net` ids every batch's `incompletePlayerFills` fills;
   * with `before`, only the batches whose directory name sorts before it.
   */
  async filledTpIds(before?: string): Promise<ReadonlySet<string>> {
    const dir = join(await this.worktreeRoot(), MANUAL_BATCHES_DIR);
    const ids = new Set<string>();
    for (const batch of await this.batches(dir)) {
      if (before !== undefined && batch >= before) {
        continue;
      }
      for (const id of await this.batchFills(join(dir, batch))) {
        ids.add(id);
      }
    }
    return ids;
  }

  private async batches(dir: string): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (this.errorCode(error) === 'ENOENT') {
        throw new Error(
          `${dir} does not exist; the manual-import batches are read from this checkout.`,
          { cause: error },
        );
      }
      throw error;
    }
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  private async batchFills(batchDir: string): Promise<string[]> {
    const ids: string[] = [];
    const files = (await readdir(batchDir, { withFileTypes: true })).filter(
      (entry) => entry.isFile() && entry.name.endsWith('.json5'),
    );
    for (const file of files) {
      const path = join(batchDir, file.name);
      const text = await readFile(path, 'utf8');
      if (!text.includes('incompletePlayerFills')) {
        continue;
      }
      const parsed = batchFillsSchema.safeParse(this.parseJson5(text, path));
      if (!parsed.success) {
        throw new Error(
          `${path} has no readable incompletePlayerFills: ${parsed.error.message}`,
        );
      }
      for (const entry of parsed.data.incompletePlayerFills ?? []) {
        if (entry.player.system === 'tourplay.net') {
          ids.push(entry.player.id);
        }
      }
    }
    return ids;
  }

  private parseJson5(text: string, path: string): unknown {
    try {
      return JSON5.parse<unknown>(text);
    } catch (error) {
      throw new Error(
        `${path} is not valid JSON5: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  private worktreeRoot(): Promise<string> {
    this.root ??= this.gitRoots
      .resolve()
      .then(({ worktreeRoot }) => worktreeRoot);
    return this.root;
  }

  private errorCode(error: unknown): string | undefined {
    return error instanceof Error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
  }
}
