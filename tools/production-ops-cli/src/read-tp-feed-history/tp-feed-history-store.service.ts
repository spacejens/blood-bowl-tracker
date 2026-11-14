import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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
    const parsed = stateSchema.safeParse(this.parseJson(text));
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
    try {
      await writeFile(
        join(dir, `${message.id}.json`),
        `${JSON.stringify(message, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' },
      );
      return true;
    } catch (error) {
      if (this.errorCode(error) === 'EEXIST') return false;
      throw error;
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
    for (const name of names.filter((n) => n.endsWith('.json'))) {
      const text = await readFile(join(dir, name), 'utf8');
      messages.push(tpFeedMessageSchema.parse(this.parseJson(text)));
    }
    return messages;
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
    await writeFile(
      join(dir, name),
      `${JSON.stringify(value, null, 2)}\n`,
      'utf8',
    );
  }

  private parseJson(text: string): unknown {
    return JSON.parse(text) as unknown;
  }

  private errorCode(error: unknown): string | undefined {
    return error instanceof Error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
  }
}
