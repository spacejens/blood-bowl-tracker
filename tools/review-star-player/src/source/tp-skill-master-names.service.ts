import {
  TpFileNameService,
  TpFilesReaderService,
} from '@blood-bowl-tracker/read-tp-files';
import { Injectable } from '@nestjs/common';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';

/** One TP skill master: its display name and BB2025's elite marker. */
export interface TpRawSkillMaster {
  name: string;
  isElite: boolean;
}

/**
 * Turns TP's opaque `skillMasterId`s into names, by scanning the downloaded
 * `rosters_<id>.json` files once per process.
 *
 * TP's official team list (`teams/<rulesSet>/*.json`) names a position's
 * skills by id only — no name and no elite marker anywhere in the file — but
 * every real team roster embeds the full `skillMaster` object wherever a skill
 * appears. Roster files are a small fraction of the mirror's bytes (match
 * files are the bulk and are deliberately not read here), so this scan is the
 * cheap way to make the TP raw panel readable at all.
 *
 * `isElite` is OR-accumulated across every embedding of the same id, never
 * overwritten: the real mirror embeds the same master both in full and as a
 * partial record that omits the flag, so last-write-wins would lose it
 * depending on walk order.
 *
 * A recursive walk rather than a schema: `skillMaster` sits at several
 * different nesting depths, and anything that is not a well-formed (numeric
 * id, non-empty string name) pair is skipped. Deliberately does not use
 * `packages/parse-tp` — that parser's reading of these files is code under
 * review.
 *
 * A deliberate copy of `tools/review-race`'s service of the same name, which
 * now holds only the interpretation (walking the embedded skill masters):
 * locating and reading the files is `packages/read-tp-files`, and the review
 * tools never depend on each other.
 */
@Injectable()
export class TpSkillMasterNamesService {
  private index: Promise<Map<number, TpRawSkillMaster>> | undefined;

  constructor(
    private readonly config: StarPlayerReviewConfigService,
    private readonly tpFiles: TpFilesReaderService,
    private readonly names: TpFileNameService,
  ) {}

  async masterFor(skillMasterId: number): Promise<TpRawSkillMaster | null> {
    this.index ??= this.buildIndex();
    return (await this.index).get(skillMasterId) ?? null;
  }

  private async buildIndex(): Promise<Map<number, TpRawSkillMaster>> {
    const masters = new Map<number, TpRawSkillMaster>();
    const dataDir = this.config.getDataDir('tp');
    for (const era of await this.tpFiles.listEras(dataDir)) {
      for (const competition of await this.tpFiles.listCompetitions(
        dataDir,
        era,
      )) {
        for (const name of await this.tpFiles.listFiles(
          dataDir,
          era,
          competition,
        )) {
          if (this.names.classify(name).kind === 'rosters') {
            this.walk(
              await this.readOrNull(dataDir, [era, competition, name]),
              masters,
            );
          }
        }
      }
    }
    return masters;
  }

  private walk(value: unknown, masters: Map<number, TpRawSkillMaster>): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.walk(item, masters);
      }
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    const record = value as Record<string, unknown>;
    this.absorbMaster(record.skillMaster, masters);
    for (const child of Object.values(record)) {
      this.walk(child, masters);
    }
  }

  private absorbMaster(
    master: unknown,
    masters: Map<number, TpRawSkillMaster>,
  ): void {
    if (master === null || typeof master !== 'object') {
      return;
    }
    const { id, name, isElite } = master as {
      id?: unknown;
      name?: unknown;
      isElite?: unknown;
    };
    if (typeof id !== 'number' || typeof name !== 'string' || name === '') {
      return;
    }
    const existing = masters.get(id);
    masters.set(id, {
      name,
      isElite: (existing?.isElite ?? false) || isElite === true,
    });
  }

  /** One file's JSON, or null when it is missing or unparseable. */
  private async readOrNull(
    dataDir: string,
    segments: readonly string[],
  ): Promise<unknown> {
    try {
      return (await this.tpFiles.readJson(dataDir, segments))?.content ?? null;
    } catch {
      return null;
    }
  }
}
