import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { TP_FILE_EXTENSION, TP_TEAMS_DIR } from './tp-file-names';

/** A path segment that could address something outside its parent. */
const UNSAFE_SEGMENT = /[/\\]|^\.\.?$/u;

export interface TpJsonFile {
  /** The path read: the data directory joined with the segments. */
  path: string;
  /** The JSON.parse'd body. */
  content: unknown;
}

/**
 * Mechanical access to download-tp's files under a caller-supplied data
 * directory: `<dataDir>/<era>/<competition>/*.json` and
 * `<dataDir>/teams/<rulesSet>/*.json`. Listings are sorted in code-unit
 * order and a missing directory lists as empty; `teams` is never an era.
 * It knows file names and layout only; what a file means stays with each
 * consumer.
 */
@Injectable()
export class TpFilesReaderService {
  async listEras(dataDir: string): Promise<string[]> {
    return (await this.directories(dataDir)).filter(
      (name) => name !== TP_TEAMS_DIR,
    );
  }

  listCompetitions(dataDir: string, era: string): Promise<string[]> {
    return this.directories(this.resolve(dataDir, [era]));
  }

  listFiles(
    dataDir: string,
    era: string,
    competition: string,
  ): Promise<string[]> {
    return this.jsonFiles(this.resolve(dataDir, [era, competition]));
  }

  listTeamsRulesSets(dataDir: string): Promise<string[]> {
    return this.directories(this.resolve(dataDir, [TP_TEAMS_DIR]));
  }

  listTeamsFiles(dataDir: string, rulesSet: string): Promise<string[]> {
    return this.jsonFiles(this.resolve(dataDir, [TP_TEAMS_DIR, rulesSet]));
  }

  /** One file's parsed JSON, or null when it does not exist. */
  async readJson(
    dataDir: string,
    segments: readonly string[],
  ): Promise<TpJsonFile | null> {
    const path = this.resolve(dataDir, segments);
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
    try {
      return { path, content: JSON.parse(raw) as unknown };
    } catch (error) {
      throw new Error(
        `Failed to parse TP file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  private resolve(dataDir: string, segments: readonly string[]): string {
    for (const segment of segments) {
      if (segment === '' || UNSAFE_SEGMENT.test(segment)) {
        throw new Error(`Unsafe TP data path segment "${segment}"`);
      }
    }
    return join(dataDir, ...segments);
  }

  private async directories(dir: string): Promise<string[]> {
    return this.names((await this.entries(dir)).filter((e) => e.isDirectory()));
  }

  private async jsonFiles(dir: string): Promise<string[]> {
    return this.names(
      (await this.entries(dir)).filter(
        (entry) => entry.isFile() && entry.name.endsWith(TP_FILE_EXTENSION),
      ),
    );
  }

  /** Entry names in code-unit order, independent of the runtime's locale. */
  private names(entries: Dirent[]): string[] {
    return entries.map((entry) => entry.name).sort();
  }

  private async entries(dir: string): Promise<Dirent[]> {
    try {
      return await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
