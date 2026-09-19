import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import type { RawIncreaseCounts } from './bbl-player-skills-cell.service';
import { TpSkillMasterNamesService } from './tp-skill-master-names.service';

/** `rosters_<id>.json` — TP's per-team roster file. */
const ROSTER_FILENAME = /^rosters_\d+\.json$/;

/** One skill on a TP roster entry or its position template. */
export interface TpRawPlayerSkill {
  skillMasterId: number;
  /** From the entry's own embedded `skillMaster`; null when it carried none. */
  name: string | null;
  attributeValue: string | null;
  /**
   * OR of the entry's own embedded `skillMaster.isElite` and
   * `TpSkillMasterNamesService`'s scanned master index. The local embedding
   * at this path is a partial record that essentially never carries
   * `isElite: true`, even for skills that genuinely are elite — the master
   * index, built by scanning every embedding of the same id across every
   * roster file, is the reliable source. NOT the per-pick `isElite` field
   * some skill entries also carry — that field essentially never agrees with
   * the master's across real data.
   */
  isElite: boolean;
}

/** One skill the player gained. */
export interface TpRawGainedSkill extends TpRawPlayerSkill {
  /**
   * TP's own record of whether the advancement was randomly rolled rather
   * than freely chosen. Null when the entry carried no such field, which is
   * not the same as "chosen" and is never guessed at.
   */
  isRandom: boolean | null;
}

/** Everything TP's roster files say about one player's advancements. */
export interface TpRawPlayerAdvancements {
  startingSkills: TpRawPlayerSkill[];
  gainedSkills: TpRawGainedSkill[];
  /**
   * Per-characteristic improvement against the position template: current
   * minus template for MA/ST/AV, template minus current for AG/PA (a roll
   * target improves downwards), clamped at zero.
   *
   * DERIVED, not reported. TP publishes no advancement counter at all, and a
   * reduction (injury) and an advancement on the same characteristic cancel
   * out here. It is shown for orientation, never compared against the stored
   * `*IncreaseCount` columns — no importer writes those from TP.
   */
  characteristicDiffs: RawIncreaseCounts;
  /** False when the roster entry carried no position template at all. */
  hasTemplate: boolean;
}

/**
 * A roster-file-only index of every player's skills, keyed by TP line-up id.
 *
 * TP puts a player's starting skills on the entry's nested `lineUpMaster`
 * (the position template) and their gained skills on the entry's own
 * `skills[]`, each with an embedded `skillMaster` carrying the display name
 * and, on BB2025 skills, TP's `isElite` marker. Only `rosters_<id>.json`
 * files carry any of this — the `lineUps[]` snapshots inside match files do
 * not — so this scans those files only, which is also why it is a separate
 * index from `TpRawPlayerIndexService` rather than more fields on it.
 *
 * A line-up id can appear in several roster files with disagreeing values;
 * ties break the same way that service already breaks them, by treating the
 * higher-numbered file id as the more recent source.
 *
 * Every shape check is defensive: this reads unvalidated JSON straight off
 * disk, and a raw panel that throws is strictly worse for a reviewer than one
 * that shows a gap. Deliberately does not use `packages/parse-tp` — that
 * parser's reading of these files is code under review.
 */
@Injectable()
export class TpRawPlayerSkillsIndexService {
  private index:
    | Promise<
        Map<number, { rosterId: number; advancements: TpRawPlayerAdvancements }>
      >
    | undefined;

  constructor(
    private readonly config: ReviewPlayerConfigService,
    private readonly skillMasterNames: TpSkillMasterNamesService,
  ) {}

  async advancementsFor(
    externalId: string,
  ): Promise<TpRawPlayerAdvancements | null> {
    const lineUpId = Number(externalId);
    if (!Number.isInteger(lineUpId)) {
      return null;
    }
    this.index ??= this.buildIndex();
    return (await this.index).get(lineUpId)?.advancements ?? null;
  }

  private async buildIndex(): Promise<
    Map<number, { rosterId: number; advancements: TpRawPlayerAdvancements }>
  > {
    const players = new Map<
      number,
      { rosterId: number; advancements: TpRawPlayerAdvancements }
    >();
    const dataDir = this.config.getDataDir('tp');
    for (const era of await this.subdirectories(dataDir)) {
      const eraDir = join(dataDir, era.name);
      for (const competition of await this.subdirectories(eraDir)) {
        const competitionDir = join(eraDir, competition.name);
        for (const entry of await this.entries(competitionDir)) {
          const match = ROSTER_FILENAME.exec(entry.name);
          if (entry.isFile() && match !== null) {
            const body = await this.readJson(join(competitionDir, entry.name));
            const rosterId = Number(/\d+/.exec(entry.name)?.[0] ?? 0);
            await this.absorb(players, body, rosterId);
          }
        }
      }
    }
    return players;
  }

  private async absorb(
    players: Map<
      number,
      { rosterId: number; advancements: TpRawPlayerAdvancements }
    >,
    file: unknown,
    rosterId: number,
  ): Promise<void> {
    for (const entry of this.arrayProperty(file, 'lineUps')) {
      const id = this.property(entry, 'id');
      if (typeof id !== 'number') {
        continue;
      }
      const existing = players.get(id);
      if (existing !== undefined && existing.rosterId >= rosterId) {
        continue;
      }
      players.set(id, {
        rosterId,
        advancements: await this.advancements(entry),
      });
    }
  }

  private async advancements(entry: unknown): Promise<TpRawPlayerAdvancements> {
    const template = this.property(entry, 'lineUpMaster');
    const hasTemplate = typeof template === 'object' && template !== null;
    const startingSkills = (
      await Promise.all(
        this.arrayProperty(template, 'skills').map((skill) =>
          this.skill(skill),
        ),
      )
    ).flat();
    const gainedSkills = (
      await Promise.all(
        this.arrayProperty(entry, 'skills').map(async (skill) => {
          const [base] = await this.skill(skill);
          if (base === undefined) {
            return [];
          }
          const isRandom = this.property(skill, 'isRandom');
          return [
            {
              ...base,
              isRandom: typeof isRandom === 'boolean' ? isRandom : null,
            },
          ];
        }),
      )
    ).flat();
    return {
      startingSkills,
      gainedSkills,
      characteristicDiffs: this.diffs(entry, template, hasTemplate),
      hasTemplate,
    };
  }

  /** One skill ref, or nothing when the entry has no usable id. */
  private async skill(skill: unknown): Promise<TpRawPlayerSkill[]> {
    const skillMasterId = this.property(skill, 'skillMasterId');
    if (typeof skillMasterId !== 'number') {
      return [];
    }
    const skillMaster = this.property(skill, 'skillMaster');
    const name = this.property(skillMaster, 'name');
    const value = this.property(
      this.property(skill, 'skillAttributeMaster'),
      'value',
    );
    const localIsElite = this.property(skillMaster, 'isElite') === true;
    const master = await this.skillMasterNames.masterFor(skillMasterId);
    return [
      {
        skillMasterId,
        name: typeof name === 'string' && name !== '' ? name : null,
        attributeValue: typeof value === 'string' ? value : null,
        isElite: localIsElite || (master?.isElite ?? false),
      },
    ];
  }

  /**
   * Current minus template per characteristic, clamped at zero. AG and PA are
   * roll targets under every rules set TP covers, so an improvement LOWERS
   * the number and the subtraction runs the other way.
   */
  private diffs(
    entry: unknown,
    template: unknown,
    hasTemplate: boolean,
  ): RawIncreaseCounts {
    const zero = {
      move: 0,
      strength: 0,
      agility: 0,
      passing: 0,
      armour: 0,
    };
    if (!hasTemplate) {
      return zero;
    }
    const up = (key: string): number =>
      Math.max(
        0,
        (this.numberProperty(entry, key) ?? 0) -
          (this.numberProperty(template, key) ?? 0),
      );
    const down = (key: string): number =>
      Math.max(
        0,
        (this.numberProperty(template, key) ?? 0) -
          (this.numberProperty(entry, key) ?? 0),
      );
    return {
      move: up('ma'),
      strength: up('st'),
      agility: down('ag'),
      passing: down('pa'),
      armour: up('av'),
    };
  }

  private numberProperty(value: unknown, key: string): number | null {
    const property = this.property(value, key);
    return typeof property === 'number' ? property : null;
  }

  private arrayProperty(value: unknown, key: string): unknown[] {
    const property = this.property(value, key);
    return Array.isArray(property) ? property : [];
  }

  private property(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }

  private async readJson(path: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      return null;
    }
  }

  private async subdirectories(dir: string): Promise<Dirent[]> {
    return (await this.entries(dir)).filter((entry) => entry.isDirectory());
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
