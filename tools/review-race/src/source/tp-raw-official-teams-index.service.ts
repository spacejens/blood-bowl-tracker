import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { RaceReviewConfigService } from '../config/review-race-config.service';

/** The folder under the TP data root holding one subfolder per rules set. */
const TEAMS_DIR = 'teams';

/**
 * The `teamRosterType` marking a roster as one of the rules set's OFFICIAL
 * teams. The same response also carries legacy (1), Secret Bowl / unofficial
 * (3) and experimental (4) rosters, and only the official ones are imported —
 * so only the official ones belong on the raw side of the comparison.
 */
const OFFICIAL_ROSTER_TYPE = 0;

/** The five characteristics TP carries on every official-list entry. */
export interface TpRawPositionCharacteristics {
  move: number;
  strength: number;
  agility: number;
  /** TP writes a literal 0 for a position with no passing ability. */
  passing: number;
  armour: number;
}

/** One entry on a race's official list, under one rules set. */
export interface TpRawOfficialPosition {
  name: string;
  /** True for a star-player entry. */
  isStar: boolean;
  /** The `teams/<rulesSet>/` folder this entry was read from. */
  rulesSet: string;
  /** TP's own numeric id, when the official list carries one. */
  tpPositionId: number | null;
  characteristics: TpRawPositionCharacteristics;
}

/** What TP's own official team list says about one race code. */
export interface TpRawOfficialRace {
  teamRaceCode: string;
  /** The official list's display name for this race. */
  raceName: string | null;
  /** Rules sets whose official list carries this code, in folder order. */
  rulesSets: string[];
  /** Positions, deduplicated by (rules set, name). */
  positions: TpRawOfficialPosition[];
}

/** One rules set's file, reduced to what a race's raw picture needs. */
interface AbsorbSource {
  rulesSet: string;
  stars: unknown[];
  roster: unknown;
}

/**
 * TP's official team list — one `teams/<rulesSet>/*.json` per rules set — read
 * on this tool's own terms. The whole mirror is scanned exactly once per
 * process, because the alternative — re-scanning per sampled race — would
 * re-parse the same files repeatedly.
 *
 * Every shape check is defensive: this reads unvalidated JSON straight off
 * disk, and a raw panel that throws is strictly worse for a reviewer than one
 * that shows a gap. Deliberately does not use packages/parse-tp's
 * OfficialTeamsParserService — that parser's reading of these files is code
 * under review, and a bug in it must not agree with itself against the raw
 * display.
 */
@Injectable()
export class TpRawOfficialTeamsIndexService {
  private index: Promise<Map<string, TpRawOfficialRace>> | undefined;

  constructor(private readonly config: RaceReviewConfigService) {}

  async raceFor(teamRaceCode: string): Promise<TpRawOfficialRace | null> {
    this.index ??= this.buildIndex();
    return (await this.index).get(teamRaceCode) ?? null;
  }

  private async buildIndex(): Promise<Map<string, TpRawOfficialRace>> {
    const races = new Map<string, TpRawOfficialRace>();
    const teamsDir = join(this.config.getDataDir('tp'), TEAMS_DIR);
    for (const rulesSet of await this.subdirectories(teamsDir)) {
      const rulesSetDir = join(teamsDir, rulesSet.name);
      for (const entry of await this.entries(rulesSetDir)) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const file = await this.readJson(join(rulesSetDir, entry.name));
          this.absorbFile(races, file, rulesSet.name);
        }
      }
    }
    return races;
  }

  private absorbFile(
    races: Map<string, TpRawOfficialRace>,
    file: unknown,
    rulesSet: string,
  ): void {
    const stars = this.arrayProperty(file, 'starplayerMasters');
    for (const roster of this.arrayProperty(file, 'rosterMasters')) {
      this.absorb(races, { rulesSet, stars, roster });
    }
  }

  /**
   * One `rosterMasters[]` entry. Non-official rosters are dropped here, so a
   * legacy, Secret Bowl or experimental roster never reaches the report — the
   * importer drops exactly the same ones.
   */
  private absorb(
    races: Map<string, TpRawOfficialRace>,
    source: AbsorbSource,
  ): void {
    const { roster, rulesSet } = source;
    const teamRaceCode = this.property(roster, 'teamRace');
    if (
      this.property(roster, 'teamRosterType') !== OFFICIAL_ROSTER_TYPE ||
      typeof teamRaceCode !== 'string' ||
      teamRaceCode === ''
    ) {
      return;
    }
    const raceName = this.property(roster, 'name');
    const race: TpRawOfficialRace = races.get(teamRaceCode) ?? {
      teamRaceCode,
      raceName: typeof raceName === 'string' ? raceName : null,
      rulesSets: [],
      positions: [],
    };
    if (!race.rulesSets.includes(rulesSet)) {
      race.rulesSets.push(rulesSet);
    }
    const seen = new Set(
      race.positions.map((entry) => this.key(entry.rulesSet, entry.name)),
    );
    this.absorbEntries(race, seen, {
      rulesSet,
      entries: this.arrayProperty(roster, 'lineUpMasters'),
      isStar: false,
    });
    this.absorbEntries(race, seen, {
      rulesSet,
      entries: source.stars.filter((star) => this.isAvailableTo(star, roster)),
      isStar: true,
    });
    races.set(teamRaceCode, race);
  }

  private absorbEntries(
    race: TpRawOfficialRace,
    seen: Set<string>,
    source: { rulesSet: string; entries: unknown[]; isStar: boolean },
  ): void {
    for (const entry of source.entries) {
      const position = this.position(entry, source);
      if (
        position !== null &&
        !seen.has(this.key(source.rulesSet, position.name))
      ) {
        seen.add(this.key(source.rulesSet, position.name));
        race.positions.push(position);
      }
    }
  }

  /**
   * Whether a race may hire a star. TP expresses this as two parallel
   * bitmasks: BB2025 carries the regional `leagues` a star is open to, while
   * BB2020 (and the handful of BB2025 stars whose availability is still a team
   * special rule) carries `availableTeamSpecialRules`. A race qualifies when
   * either mask overlaps its own — including the `selectable*` halves, since a
   * rule a race may CHOOSE still makes the star hireable by it.
   *
   * A star's `race[]` is NOT consulted: it is the star's own species, the same
   * id space `lineUpMasters[].race` uses. Nor is `availableRaces`, a literal 0
   * on every star that carries it.
   */
  private isAvailableTo(star: unknown, roster: unknown): boolean {
    const byLeague =
      this.mask(star, 'availableLeagues') &
      (this.mask(roster, 'leagues') | this.mask(roster, 'selectableLeagues'));
    const bySpecialRule =
      this.mask(star, 'availableTeamSpecialRules') &
      (this.mask(roster, 'teamSpecialRules') |
        this.mask(roster, 'selectableTeamSpecialRules'));
    return byLeague !== 0 || bySpecialRule !== 0;
  }

  /** A bitmask field, treating anything non-numeric as no bits set. */
  private mask(value: unknown, key: string): number {
    const property = this.property(value, key);
    return typeof property === 'number' ? property : 0;
  }

  private key(rulesSet: string, name: string): string {
    return `${rulesSet} ${name}`;
  }

  private position(
    entry: unknown,
    source: { rulesSet: string; isStar: boolean },
  ): TpRawOfficialPosition | null {
    const id = this.property(entry, 'id');
    const name = this.property(entry, 'position');
    const move = this.property(entry, 'ma');
    const strength = this.property(entry, 'st');
    const agility = this.property(entry, 'ag');
    const passing = this.property(entry, 'pa');
    const armour = this.property(entry, 'av');
    if (
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
      name,
      isStar: source.isStar,
      rulesSet: source.rulesSet,
      tpPositionId: typeof id === 'number' ? id : null,
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
