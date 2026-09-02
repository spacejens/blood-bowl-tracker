import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { RaceReviewConfigService } from '../config/review-race-config.service';

/** `rosters_<id>.json` — TP's standalone roster file. */
const ROSTER_FILENAME = /^rosters_\d+\.json$/;

/** The five characteristics TP carries on every master entry. */
export interface TpRawPositionCharacteristics {
  move: number;
  strength: number;
  agility: number;
  /** TP writes a literal 0 for a position with no passing ability. */
  passing: number;
  armour: number;
}

/** One position template from a roster's masters lists. */
export interface TpRawPosition {
  tpPositionId: number;
  name: string;
  /** True for a `starPlayersMasters` entry. */
  isStar: boolean;
  characteristics: TpRawPositionCharacteristics;
}

/** What TP's own roster files say about one race code. */
export interface TpRawRace {
  teamRaceCode: string;
  /** `rosterMaster.name`, from the first roster seen for this code. */
  rosterName: string | null;
  /** How many roster files carry this code. */
  rosterCount: number;
  /** Positions, deduplicated by TP's own position id. */
  positions: TpRawPosition[];
}

/**
 * TP publishes no per-race file, so a race's raw picture is assembled from
 * every `rosters_<id>.json` carrying its `teamRace` code. The whole mirror is
 * scanned exactly once per process, because the alternative — re-scanning per
 * sampled race — would re-parse the same files repeatedly.
 *
 * Every shape check is defensive: this reads unvalidated JSON straight off
 * disk, and a raw panel that throws is strictly worse for a reviewer than one
 * that shows a gap. Deliberately does not use packages/parse-tp's
 * RosterParserService — that parser's reading of these files is code under
 * review.
 */
@Injectable()
export class TpRawRosterIndexService {
  private index: Promise<Map<string, TpRawRace>> | undefined;

  constructor(private readonly config: RaceReviewConfigService) {}

  async raceFor(teamRaceCode: string): Promise<TpRawRace | null> {
    this.index ??= this.buildIndex();
    return (await this.index).get(teamRaceCode) ?? null;
  }

  private async buildIndex(): Promise<Map<string, TpRawRace>> {
    const races = new Map<string, TpRawRace>();
    const dataDir = this.config.getDataDir('tp');
    for (const era of await this.subdirectories(dataDir)) {
      const eraDir = join(dataDir, era.name);
      for (const competition of await this.subdirectories(eraDir)) {
        const competitionDir = join(eraDir, competition.name);
        for (const entry of await this.entries(competitionDir)) {
          if (entry.isFile() && ROSTER_FILENAME.test(entry.name)) {
            const file = await this.readJson(join(competitionDir, entry.name));
            this.absorb(races, file);
          }
        }
      }
    }
    return races;
  }

  private absorb(races: Map<string, TpRawRace>, file: unknown): void {
    const teamRaceCode = this.property(file, 'teamRace');
    if (typeof teamRaceCode !== 'string' || teamRaceCode === '') {
      return;
    }
    const master = this.property(file, 'rosterMaster');
    const rosterName = this.property(master, 'name');
    const existing = races.get(teamRaceCode);
    const race: TpRawRace = existing ?? {
      teamRaceCode,
      rosterName: typeof rosterName === 'string' ? rosterName : null,
      rosterCount: 0,
      positions: [],
    };
    race.rosterCount += 1;
    const seen = new Set(race.positions.map((entry) => entry.tpPositionId));
    this.absorbMasters(race, seen, {
      entries: this.arrayProperty(master, 'lineUpMasters'),
      isStar: false,
    });
    this.absorbMasters(race, seen, {
      entries: this.arrayProperty(master, 'starPlayersMasters'),
      isStar: true,
    });
    races.set(teamRaceCode, race);
  }

  private absorbMasters(
    race: TpRawRace,
    seen: Set<number>,
    source: { entries: unknown[]; isStar: boolean },
  ): void {
    for (const entry of source.entries) {
      const position = this.position(entry, source.isStar);
      if (position !== null && !seen.has(position.tpPositionId)) {
        seen.add(position.tpPositionId);
        race.positions.push(position);
      }
    }
  }

  private position(entry: unknown, isStar: boolean): TpRawPosition | null {
    const id = this.property(entry, 'id');
    const name = this.property(entry, 'position');
    const move = this.property(entry, 'ma');
    const strength = this.property(entry, 'st');
    const agility = this.property(entry, 'ag');
    const passing = this.property(entry, 'pa');
    const armour = this.property(entry, 'av');
    if (
      typeof id !== 'number' ||
      typeof name !== 'string' ||
      typeof move !== 'number' ||
      typeof strength !== 'number' ||
      typeof agility !== 'number' ||
      typeof passing !== 'number' ||
      typeof armour !== 'number'
    ) {
      return null;
    }
    return {
      tpPositionId: id,
      name,
      isStar,
      characteristics: { move, strength, agility, passing, armour },
    };
  }

  private async readJson(path: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      return null;
    }
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
