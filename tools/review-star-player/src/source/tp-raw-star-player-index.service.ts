import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';

/** The folder under the TP data root holding one subfolder per rules set. */
const TEAMS_DIR = 'teams';

/**
 * The `teamRosterType` values marking a roster as one of the rules set's real
 * teams: `0` official and `1` legacy. Legacy is an older, superseded
 * generation of an official roster leagues really played, so both count when
 * deciding which races could hire a star. Unofficial (3) and experimental (4)
 * rosters are genuinely non-canonical and stay out.
 */
const CANONICAL_ROSTER_TYPES = new Set([0, 1]);

/** TP's five characteristics on a star entry. */
export interface TpRawStarPlayerCharacteristics {
  move: number;
  strength: number;
  agility: number;
  /** TP writes a literal 0 for a star with no passing ability. */
  passing: number;
  armour: number;
}

/** What one rules set's official list says about one star. */
export interface TpRawStarPlayerEntry {
  /** The `teams/<rulesSet>/` folder this entry was read from. */
  rulesSet: string;
  cost: number | null;
  specialRuleName: string | null;
  characteristics: TpRawStarPlayerCharacteristics | null;
  /** `teamRace` codes of the canonical rosters that may hire this star. */
  eligibleTeamRaces: string[];
}

/** One star as TP carries it, across every rules set. */
export interface TpRawStarPlayer {
  name: string;
  /** One entry per rules set, in folder order. */
  entries: TpRawStarPlayerEntry[];
}

/** One rules set's file, reduced to what the index needs. */
interface FileSource {
  rulesSet: string;
  stars: unknown[];
  rosters: unknown[];
}

/**
 * TP's star player catalog — the `starplayerMasters[]` of each
 * `teams/<rulesSet>/*.json` — read on this tool's own terms. The whole mirror
 * is scanned exactly once per process; re-scanning per sampled star would
 * re-parse the same files repeatedly.
 *
 * Which races may hire a star is TP's two parallel bitmasks: BB2025 carries
 * the regional `leagues` a star is open to, while BB2020 (and a handful of
 * BB2025 stars) carries `availableTeamSpecialRules`. A roster qualifies when
 * either mask overlaps its own, including the `selectable*` halves — a rule a
 * race may CHOOSE still makes the star hireable by it. A star's `race[]` is
 * NOT consulted: that is the star's own species.
 *
 * Every shape check is defensive: this reads unvalidated JSON straight off
 * disk, and a raw panel that throws is strictly worse for a reviewer than one
 * that shows a gap. Deliberately does not use packages/parse-tp — that
 * parser's reading of these files is code under review, and a bug in it must
 * not agree with itself against the raw display.
 *
 * `starFor` tries an exact name match first, then falls back to
 * `StarPlayerNameMatcherService.normalize()` — BBL and TP disagree routinely
 * on apostrophes, quote style and a duo star's parenthesised partner, and a
 * lookup keyed on exact text alone would report "no data" for a star that
 * really is there under a different spelling.
 */
@Injectable()
export class TpRawStarPlayerIndexService {
  private index: Promise<Map<string, TpRawStarPlayer>> | undefined;
  private normalizedIndex: Promise<Map<string, TpRawStarPlayer>> | undefined;

  constructor(
    private readonly config: StarPlayerReviewConfigService,
    private readonly names: StarPlayerNameMatcherService,
  ) {}

  async starFor(name: string): Promise<TpRawStarPlayer | null> {
    this.index ??= this.buildIndex();
    const exact = (await this.index).get(name);
    if (exact !== undefined) {
      return exact;
    }
    this.normalizedIndex ??= this.buildNormalizedIndex();
    return (await this.normalizedIndex).get(this.names.normalize(name)) ?? null;
  }

  private async buildNormalizedIndex(): Promise<Map<string, TpRawStarPlayer>> {
    const index = new Map<string, TpRawStarPlayer>();
    for (const [name, star] of await (this.index ??= this.buildIndex())) {
      const key = this.names.normalize(name);
      if (!index.has(key)) {
        index.set(key, star);
      }
    }
    return index;
  }

  /** Every star name TP carries, in the order they were indexed. */
  async allNames(): Promise<string[]> {
    this.index ??= this.buildIndex();
    return [...(await this.index).keys()];
  }

  private async buildIndex(): Promise<Map<string, TpRawStarPlayer>> {
    const stars = new Map<string, TpRawStarPlayer>();
    const teamsDir = join(this.config.getDataDir('tp'), TEAMS_DIR);
    for (const rulesSet of await this.subdirectories(teamsDir)) {
      const rulesSetDir = join(teamsDir, rulesSet.name);
      for (const entry of await this.entries(rulesSetDir)) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const file = await this.readJson(join(rulesSetDir, entry.name));
          this.absorb(stars, {
            rulesSet: rulesSet.name,
            stars: this.arrayProperty(file, 'starplayerMasters'),
            rosters: this.arrayProperty(file, 'rosterMasters'),
          });
        }
      }
    }
    return stars;
  }

  private absorb(
    stars: Map<string, TpRawStarPlayer>,
    source: FileSource,
  ): void {
    const canonical = source.rosters.filter((roster) =>
      CANONICAL_ROSTER_TYPES.has(this.mask(roster, 'teamRosterType')),
    );
    for (const raw of source.stars) {
      const name = this.property(raw, 'position');
      if (typeof name !== 'string' || name === '') {
        continue;
      }
      const star = stars.get(name) ?? { name, entries: [] };
      star.entries.push({
        rulesSet: source.rulesSet,
        cost: this.number(raw, 'cost'),
        specialRuleName: this.string(raw, 'specialRuleName'),
        characteristics: this.characteristics(raw),
        eligibleTeamRaces: this.eligibleTeamRaces(raw, canonical),
      });
      stars.set(name, star);
    }
  }

  private eligibleTeamRaces(star: unknown, rosters: unknown[]): string[] {
    const codes: string[] = [];
    for (const roster of rosters) {
      const code = this.property(roster, 'teamRace');
      if (
        typeof code !== 'string' ||
        code === '' ||
        codes.includes(code) ||
        !this.isAvailableTo(star, roster)
      ) {
        continue;
      }
      codes.push(code);
    }
    return codes;
  }

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

  private characteristics(
    star: unknown,
  ): TpRawStarPlayerCharacteristics | null {
    const move = this.number(star, 'ma');
    const strength = this.number(star, 'st');
    const agility = this.number(star, 'ag');
    const passing = this.number(star, 'pa');
    const armour = this.number(star, 'av');
    if (
      move === null ||
      strength === null ||
      agility === null ||
      passing === null ||
      armour === null
    ) {
      return null;
    }
    return { move, strength, agility, passing, armour };
  }

  /** A bitmask field, treating anything non-numeric as no bits set. */
  private mask(value: unknown, key: string): number {
    const property = this.property(value, key);
    return typeof property === 'number' ? property : 0;
  }

  private number(value: unknown, key: string): number | null {
    const property = this.property(value, key);
    return typeof property === 'number' ? property : null;
  }

  private string(value: unknown, key: string): string | null {
    const property = this.property(value, key);
    return typeof property === 'string' && property !== '' ? property : null;
  }

  private property(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }

  private arrayProperty(value: unknown, key: string): unknown[] {
    const property = this.property(value, key);
    return Array.isArray(property) ? property : [];
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
