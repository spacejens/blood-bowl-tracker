import { randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { TpFeedHistoryIndex } from './tp-feed-history-index.service';
import { TpFeedMessage, tpFeedMessageSchema } from './tp-feed-message.schema';

/** Gitignored; symlinked back to the main checkout from every worktree. */
export const TP_FEED_HISTORY_DATA_DIR = 'tools/production-ops-cli/data';

/** How far a channel's history has been read, saved after every page. */
export interface TpFeedHistoryState {
  readonly guildId: string;
  /** The newest message id fetched, or null before anything was fetched. */
  readonly newestId: string | null;
  /** The oldest message id fetched, or null before anything was fetched. */
  readonly oldestId: string | null;
  readonly reachedStart: boolean;
}

const stateSchema = z.object({
  guildId: z.string(),
  newestId: z.string().nullable(),
  oldestId: z.string().nullable(),
  reachedStart: z.boolean(),
});

/**
 * The saved TP feed history of one channel: `messages/<id>.json` (raw
 * advancement messages, written once and never overwritten), `state.json`,
 * and the regenerated `reports.json` and `unparsed.json`.
 */
@Injectable()
export class TpFeedHistoryStoreService {
  private root?: Promise<string>;

  constructor(private readonly gitRoots: GitRootsService) {}

  async directory(channelId: string): Promise<string> {
    if (!/^\d+$/.test(channelId)) {
      throw new Error(`Invalid Discord channel id: ${channelId}`);
    }
    this.root ??= this.gitRoots
      .resolve()
      .then(({ worktreeRoot }) => join(worktreeRoot, TP_FEED_HISTORY_DATA_DIR));
    return join(await this.root, `tp-feed-${channelId}`);
  }

  async readState(channelId: string): Promise<TpFeedHistoryState | null> {
    const path = join(await this.directory(channelId), 'state.json');
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (this.errorCode(error) === 'ENOENT') return null;
      throw error;
    }
    const parsed = stateSchema.safeParse(this.parseJson(text, path));
    if (!parsed.success) {
      throw new Error(
        `${path} is not a valid TP feed history state file: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  async writeState(
    channelId: string,
    state: TpFeedHistoryState,
  ): Promise<void> {
    await this.writeJson(await this.directory(channelId), 'state.json', state);
  }

  async saveMessage(
    channelId: string,
    message: TpFeedMessage,
  ): Promise<boolean> {
    const dir = join(await this.directory(channelId), 'messages');
    await mkdir(dir, { recursive: true });
    const temp = join(dir, `.${message.id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, `${JSON.stringify(message, null, 2)}\n`, 'utf8');
      await link(temp, join(dir, `${message.id}.json`));
      return true;
    } catch (error) {
      if (this.errorCode(error) === 'EEXIST') return false;
      throw error;
    } finally {
      await rm(temp, { force: true });
    }
  }

  async readMessages(channelId: string): Promise<TpFeedMessage[]> {
    const dir = join(await this.directory(channelId), 'messages');
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if (this.errorCode(error) === 'ENOENT') return [];
      throw error;
    }
    const messages: TpFeedMessage[] = [];
    for (const name of names.filter((n) => /^\d+\.json$/.test(n))) {
      const path = join(dir, name);
      const parsed = tpFeedMessageSchema.safeParse(
        this.parseJson(await readFile(path, 'utf8'), path),
      );
      if (!parsed.success) {
        throw new Error(
          `${path} is not a valid saved TP feed message: ${parsed.error.message}`,
        );
      }
      messages.push(parsed.data);
    }
    return messages.sort((a, b) => {
      const diff = BigInt(a.id) - BigInt(b.id);
      return diff === 0n ? 0 : diff < 0n ? -1 : 1;
    });
  }

  async writeIndex(
    channelId: string,
    index: TpFeedHistoryIndex,
  ): Promise<void> {
    const dir = await this.directory(channelId);
    await this.writeJson(dir, 'reports.json', index.reports);
    await this.writeJson(dir, 'unparsed.json', index.unparsed);
  }

  private async writeJson(
    dir: string,
    name: string,
    value: unknown,
  ): Promise<void> {
    await mkdir(dir, { recursive: true });
    const temp = join(dir, `.${name}.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await rename(temp, join(dir, name));
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  private parseJson(text: string, path: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(
        `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  private errorCode(error: unknown): string | undefined {
    return error instanceof Error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
  }
}
