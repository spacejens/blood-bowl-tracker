import { join, posix, sep } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import {
  IncompletePlayerFillEntrySchema,
  ManualBatchLayoutService,
} from '@blood-bowl-tracker/manual-batch';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/** The manual-import batches, committed; one directory per batch. */
export const MANUAL_BATCHES_DIR = 'tools/import-manual/data/batches';

const batchFillsSchema = z.object({
  incompletePlayerFills: z.array(IncompletePlayerFillEntrySchema).optional(),
});

/**
 * The TP players the committed manual-import batches fill, so the fill
 * generator can count a player an earlier batch fills as complete on a
 * database built from scratch. Reads this checkout's batches.
 */
@Injectable()
export class ManualBatchFillsStoreService {
  private root?: Promise<string>;

  constructor(
    private readonly gitRoots: GitRootsService,
    private readonly layout: ManualBatchLayoutService,
  ) {}

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
    try {
      return (await this.layout.listBatches(dir)).map((batch) => batch.name);
    } catch (error) {
      if (this.errorCode(error) === 'ENOENT') {
        throw new Error(
          `${dir} does not exist; the manual-import batches are read from this checkout.`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  private async batchFills(batchDir: string): Promise<string[]> {
    const ids: string[] = [];
    for (const name of await this.layout.listJson5Files(batchDir)) {
      const path = join(batchDir, name);
      const parsed = batchFillsSchema.safeParse(
        await this.layout.readJson5(path),
      );
      if (!parsed.success) {
        throw new Error(
          `${path} has no readable incompletePlayerFills: ${parsed.error.message}`,
        );
      }
      for (const entry of parsed.data.incompletePlayerFills ?? []) {
        ids.push(entry.player.id);
      }
    }
    return ids;
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
