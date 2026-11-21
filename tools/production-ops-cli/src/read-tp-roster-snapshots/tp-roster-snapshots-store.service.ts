import { readdir, readFile } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';

import {
  GitRootsService,
  type WriteFileResult,
  WriteFileService,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import type { TpRosterSnapshotSourceKind } from './tp-roster-snapshot-extractor.service';
import {
  type TpRosterSnapshots,
  tpRosterSnapshotsSchema,
} from './tp-roster-snapshots.schema';

/** download-tp's files, gitignored; symlinked back to the main checkout from a worktree. */
export const TP_DATA_DIR = 'tools/import-tp/data';

/** Gitignored; `tools/production-ops-cli/data` is symlinked back to the main checkout. */
export const TP_ROSTER_SNAPSHOTS_FILE =
  'tools/production-ops-cli/data/tp-roster-snapshots/snapshots.json';

const SOURCE_FILE = /^(match|rosters)_\d+\.json$/u;

export interface TpRosterSnapshotSourceFile {
  readonly kind: TpRosterSnapshotSourceKind;
  /** Relative to the TP data directory, with `/` separators. */
  readonly source: string;
  readonly path: string;
}

/**
 * The snapshot collector's files: the downloaded `match_<id>.json` and
 * `rosters_<id>.json` files it reads, and the `snapshots.json` it saves,
 * which the fill generator reads back.
 */
@Injectable()
export class TpRosterSnapshotsStoreService {
  private root?: Promise<string>;

  constructor(
    private readonly gitRoots: GitRootsService,
    private readonly writeFile: WriteFileService,
  ) {}

  async dataDir(): Promise<string> {
    return join(await this.worktreeRoot(), TP_DATA_DIR);
  }

  async listSources(): Promise<TpRosterSnapshotSourceFile[]> {
    const dir = await this.dataDir();
    let names: string[];
    try {
      names = await readdir(dir, { recursive: true });
    } catch (error) {
      if (this.errorCode(error) === 'ENOENT') {
        throw new Error(
          `${dir} does not exist; link the TP downloads into this checkout ` +
            'with node tools/fs-utils-cli/dist/main.js sync-gitignored.',
          { cause: error },
        );
      }
      throw error;
    }
    return names
      .flatMap((name): TpRosterSnapshotSourceFile[] => {
        const match = SOURCE_FILE.exec(basename(name));
        if (match === null) {
          return [];
        }
        return [
          {
            kind: match[1] === 'match' ? 'match' : 'roster',
            source: name.split(sep).join('/'),
            path: join(dir, name),
          },
        ];
      })
      .sort((a, b) => this.compare(a.source, b.source));
  }

  async readSource(file: TpRosterSnapshotSourceFile): Promise<unknown> {
    return this.parseJson(await readFile(file.path, 'utf8'), file.path);
  }

  async writeSnapshots(snapshots: TpRosterSnapshots): Promise<WriteFileResult> {
    return this.writeFile.run(
      TP_ROSTER_SNAPSHOTS_FILE,
      `${JSON.stringify(snapshots, null, 2)}\n`,
    );
  }

  /** The saved `snapshots.json`; an error when it is missing or not valid. */
  async readSnapshots(): Promise<TpRosterSnapshots> {
    const path = join(await this.worktreeRoot(), TP_ROSTER_SNAPSHOTS_FILE);
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (this.errorCode(error) === 'ENOENT') {
        throw new Error(
          `${path} does not exist; run read-tp-roster-snapshots first.`,
          { cause: error },
        );
      }
      throw error;
    }
    const parsed = tpRosterSnapshotsSchema.safeParse(
      this.parseJson(text, path),
    );
    if (!parsed.success) {
      throw new Error(
        `${path} is not a valid TP roster snapshots file: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  private worktreeRoot(): Promise<string> {
    this.root ??= this.gitRoots
      .resolve()
      .then(({ worktreeRoot }) => worktreeRoot);
    return this.root;
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

  /** Code-unit order, so the result does not depend on the runtime's locale. */
  private compare(a: string, b: string): number {
    if (a < b) {
      return -1;
    }
    return a > b ? 1 : 0;
  }
}
