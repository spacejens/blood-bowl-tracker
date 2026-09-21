import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';

/** `match_<id>.json` — TP's per-match file, one per competition directory. */
const MATCH_FILENAME = /^match_(\d+)\.json$/;

/** `rosters_<id>.json` — TP's per-team roster file, one per team per competition. */
const ROSTERS_FILENAME = /^rosters_(\d+)\.json$/;

/** The two rosters a TP `match_<id>.json` embeds its line-ups under. */
const INSCRIPTION_KEYS = ['inscriptionLocal', 'inscriptionVisitor'] as const;

/**
 * TP's `positionTypes` bitmask on a position template, bit value -> the
 * curated positional keyword whose code that bit value IS: 1 Lineman,
 * 2 Runner, 4 Blitzer, 8 Thrower, 16 Catcher, 32 Blocker, 64 Special.
 */
const POSITION_TYPE_CODES = [1, 2, 4, 8, 16, 32, 64] as const;

/**
 * The curated code of the "Big Guy" positional keyword, which TP carries as
 * the separate `isBigGuy` boolean rather than as a `positionTypes` bit.
 */
const BIG_GUY_KEYWORD_CODE = 134;

/** Everything the raw side knows about one TP player, from the files alone. */
export interface TpRawPlayerAggregate {
  lineUpId: number;
  name: string;
  position: string;
  /** `lineUps[].totalStarPlayerPoints` from the highest match id seen. */
  totalStarPlayerPoints: number | null;
  /** Sum of `matchEvents[].starPoints` attributed to this line-up id. */
  starPointsFromEvents: number;
  /** `matchEventType` code -> number of events attributed to this player. */
  eventCounts: Map<number, number>;
  /** How many match files the player appears in. */
  matchCount: number;
  /**
   * The player's own MA/ST/AG/PA/AV, from the roster file that carries their
   * line-up id. Null when no downloaded roster file does — TP publishes a
   * player's characteristics only in `rosters_<id>.json`; the `lineUps[]`
   * snapshots embedded in a match file carry none. A `passing` of 0 is a real
   * "structurally cannot pass" value (every rules set TP covers has a
   * Passing characteristic), not an absence marker.
   */
  move: number | null;
  strength: number | null;
  agility: number | null;
  passing: number | null;
  armour: number | null;
  /**
   * The player's live lasting-injury state and the characteristics of the
   * position template they were recruited from, both from the roster file
   * that carries their line-up id. Null when no downloaded roster file does —
   * TP publishes all of this only in `rosters_<id>.json`.
   *
   * (See `templateKeywordCodes` below for how `isBigGuy` there is gated.)
   *
   * The template is what makes a stat reduction visible at all: TP has no
   * explicit flag for one, and the review panel shows the current value next
   * to its template so a reviewer can see the gap the importer claims to have
   * read — without this tool re-deriving the importer's own conclusion.
   */
  nigglingInjuries: number | null;
  canPlayNextGame: boolean | null;
  templateMove: number | null;
  templateStrength: number | null;
  templateAgility: number | null;
  templatePassing: number | null;
  templateArmour: number | null;
  /**
   * The BB2025 keyword codes of the position template this player was
   * recruited from, merged from all three fields TP spreads them over on
   * `lineUps[].lineUpMaster`: `race` (species codes), the set bits of
   * `positionTypes` (positional codes) and `isBigGuy`, the last gated on the
   * template also carrying a non-empty `race` or at least one `positionTypes`
   * bit (see `templateKeywordCodes` below). Null when no downloaded roster
   * file carries the player's line-up id, or when the template that does
   * carries none of the three -- the same absence the template
   * characteristics beside it already report.
   */
  templateKeywordCodes: number[] | null;
  /**
   * The template's raw `positionTypes` and `isBigGuy` values, shown beside the
   * decoded codes so a reviewer can check the decode without reading the
   * downloaded JSON by hand. `positionTypes` is null whenever TP carries no
   * numeric value -- TP simply omits the field rather than writing a literal
   * null, both for a Big Guy template (though some BB2025 templates carry
   * both a `positionTypes` bit and `isBigGuy` at once) and for a pre-BB2025
   * one; `templateIsBigGuy` is null when the template carries none of the
   * three keyword fields -- the same overall absence `templateKeywordCodes`
   * reports -- and otherwise the RAW unfiltered flag, false when the template
   * carries no flag of its own. Unlike `templateKeywordCodes`, this raw field
   * is never gated: showing TP's true unfiltered value is its whole purpose.
   */
  templatePositionTypes: number | null;
  templateIsBigGuy: boolean | null;
}

/** Mutable accumulator, plus the match id the reported total came from. */
interface Accumulator extends TpRawPlayerAggregate {
  latestMatchId: number;
}

/**
 * One roster line-up entry's five characteristic values, plus the entry's own
 * `totalStarPlayerPoints` — needed to decide which of two disagreeing roster
 * snapshots wins (see `absorbRoster`).
 */
interface RawCharacteristics {
  totalStarPlayerPoints: number;
  move: number | null;
  strength: number | null;
  agility: number | null;
  passing: number | null;
  armour: number | null;
  nigglingInjuries: number | null;
  canPlayNextGame: boolean | null;
  templateMove: number | null;
  templateStrength: number | null;
  templateAgility: number | null;
  templatePassing: number | null;
  templateArmour: number | null;
  templateKeywordCodes: number[] | null;
  templatePositionTypes: number | null;
  templateIsBigGuy: boolean | null;
}

/**
 * TP publishes no per-player file, so a player's raw picture has to be
 * assembled from every `match_<id>.json` they appear in: their line-up entry
 * (name, position, TP's own reported total) and every match event attributed
 * to their `lineUpId`.
 *
 * The whole mirror is scanned exactly once per process — both the
 * `match_<id>.json` files and the `rosters_<id>.json` files, which are where
 * TP publishes a player's own MA/ST/AG/PA/AV (a match file's embedded
 * `lineUps[]` entries carry none) — into an index keyed by line-up id,
 * because the alternative — re-scanning per sampled player — would re-parse
 * ~96 MB of JSON per player. The scan is the tool's slowest step by far; that
 * is the price of not reusing tools/import-tp's reader, which is the code
 * under review.
 *
 * Every shape check is defensive: this reads unvalidated JSON straight off
 * disk, and a raw panel that throws is strictly worse for a reviewer than one
 * that shows a gap. A malformed or unreadable file is skipped rather than
 * failing the run.
 */
@Injectable()
export class TpRawPlayerIndexService {
  private index: Promise<Map<number, Accumulator>> | undefined;

  constructor(private readonly config: ReviewPlayerConfigService) {}

  async aggregateFor(externalId: string): Promise<TpRawPlayerAggregate | null> {
    const lineUpId = Number(externalId);
    if (!Number.isInteger(lineUpId)) {
      return null;
    }
    this.index ??= this.buildIndex();
    return (await this.index).get(lineUpId) ?? null;
  }

  private async buildIndex(): Promise<Map<number, Accumulator>> {
    const players = new Map<number, Accumulator>();
    const characteristics = new Map<number, RawCharacteristics>();
    const dataDir = this.config.getDataDir('tp');
    for (const era of await this.subdirectories(dataDir)) {
      const eraDir = join(dataDir, era.name);
      for (const competition of await this.subdirectories(eraDir)) {
        const competitionDir = join(eraDir, competition.name);
        for (const entry of await this.entries(competitionDir)) {
          if (entry.isFile()) {
            await this.absorbFile({
              players,
              characteristics,
              file: { dir: competitionDir, name: entry.name },
            });
          }
        }
      }
    }
    this.applyCharacteristics(players, characteristics);
    return players;
  }

  private async readJsonFile(path: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      return null;
    }
  }

  /** One directory entry: a match file, a roster file, or neither. */
  private async absorbFile(input: {
    players: Map<number, Accumulator>;
    characteristics: Map<number, RawCharacteristics>;
    file: { dir: string; name: string };
  }): Promise<void> {
    const { players, characteristics, file } = input;
    const matched = MATCH_FILENAME.exec(file.name);
    const rosterMatch = ROSTERS_FILENAME.exec(file.name);
    if (matched === null && rosterMatch === null) {
      return;
    }
    const body = await this.readJsonFile(join(file.dir, file.name));
    if (body === null) {
      return;
    }
    if (matched !== null) {
      this.absorb(players, body, Number(matched[1]));
    } else if (rosterMatch !== null) {
      this.absorbRoster(characteristics, body);
    }
  }

  /**
   * Copy each roster's characteristics onto the player it belongs to. A
   * line-up id present only in a roster file is dropped: this index's unit is
   * a player seen in a match, and the rest of the aggregate would be empty.
   */
  private applyCharacteristics(
    players: Map<number, Accumulator>,
    characteristics: Map<number, RawCharacteristics>,
  ): void {
    for (const [lineUpId, line] of characteristics) {
      const player = players.get(lineUpId);
      if (player !== undefined) {
        player.move = line.move;
        player.strength = line.strength;
        player.agility = line.agility;
        player.passing = line.passing;
        player.armour = line.armour;
        player.nigglingInjuries = line.nigglingInjuries;
        player.canPlayNextGame = line.canPlayNextGame;
        player.templateMove = line.templateMove;
        player.templateStrength = line.templateStrength;
        player.templateAgility = line.templateAgility;
        player.templatePassing = line.templatePassing;
        player.templateArmour = line.templateArmour;
        player.templateKeywordCodes = line.templateKeywordCodes;
        player.templatePositionTypes = line.templatePositionTypes;
        player.templateIsBigGuy = line.templateIsBigGuy;
      }
    }
  }

  /** Fold one match file's line-ups and events into the index. */
  private absorb(
    players: Map<number, Accumulator>,
    file: unknown,
    matchId: number,
  ): void {
    for (const key of INSCRIPTION_KEYS) {
      for (const entry of this.lineUpsOf(file, key)) {
        this.absorbLineUp(players, entry, matchId);
      }
    }
    for (const event of this.arrayProperty(file, 'matchEvents')) {
      const lineUpId = this.property(event, 'lineUpId');
      const player =
        typeof lineUpId === 'number' ? players.get(lineUpId) : undefined;
      if (player !== undefined) {
        this.absorbEvent(player, event);
      }
    }
  }

  private absorbLineUp(
    players: Map<number, Accumulator>,
    entry: unknown,
    matchId: number,
  ): void {
    const id = this.property(entry, 'id');
    const name = this.property(entry, 'name');
    if (typeof id !== 'number' || typeof name !== 'string') {
      return;
    }
    const position = this.property(entry, 'position');
    const total = this.property(entry, 'totalStarPlayerPoints');
    const existing = players.get(id);
    const player: Accumulator = existing ?? {
      lineUpId: id,
      name,
      position: typeof position === 'string' ? position : 'unknown',
      totalStarPlayerPoints: null,
      starPointsFromEvents: 0,
      eventCounts: new Map(),
      matchCount: 0,
      latestMatchId: 0,
      move: null,
      strength: null,
      agility: null,
      passing: null,
      armour: null,
      nigglingInjuries: null,
      canPlayNextGame: null,
      templateMove: null,
      templateStrength: null,
      templateAgility: null,
      templatePassing: null,
      templateArmour: null,
      templateKeywordCodes: null,
      templatePositionTypes: null,
      templateIsBigGuy: null,
    };
    player.matchCount += 1;
    // TP's match ids increase over time, so the highest one a player appears
    // in carries their latest reported total, name and position.
    if (matchId >= player.latestMatchId) {
      player.latestMatchId = matchId;
      player.name = name;
      player.position = typeof position === 'string' ? position : 'unknown';
      player.totalStarPlayerPoints = typeof total === 'number' ? total : null;
    }
    players.set(id, player);
  }

  private absorbEvent(player: Accumulator, event: unknown): void {
    const type = this.property(event, 'matchEventType');
    if (typeof type === 'number') {
      player.eventCounts.set(type, (player.eventCounts.get(type) ?? 0) + 1);
    }
    const starPoints = this.property(event, 'starPoints');
    if (typeof starPoints === 'number') {
      player.starPointsFromEvents += starPoints;
    }
  }

  /**
   * A team's roster file: every line-up entry's own current characteristics,
   * keyed by the same line-up id the match files use. An entry with no
   * readable `ma` is skipped — that is the shape of a roster entry which
   * carries no characteristics line at all.
   *
   * A line-up id can appear in more than one downloaded `rosters_<id>.json`
   * file with disagreeing values — the same team's roster file can carry the
   * identical number across two unrelated competitions (TP appears to number
   * these per team, not per upload), so the filename cannot be trusted as a
   * recency signal at all. Ties are instead broken the same way
   * `absorbLineUp` breaks them for match data's `totalStarPlayerPoints`: it
   * only ever grows over a player's career, so the higher value on the entry
   * itself is always the more complete, more recent snapshot.
   *
   * Two snapshots that disagree while sharing the exact same
   * `totalStarPlayerPoints` are an anomaly TP gives no further signal to
   * resolve — `entries()` sorts the scan deterministically so which one wins
   * is at least reproducible across runs and platforms, but it is still an
   * arbitrary pick, not a verified "more recent" one. This tool surfaces
   * disagreements between the raw and imported sides; it does not also try to
   * arbitrate between two raw sources that disagree with each other.
   */
  private absorbRoster(
    characteristics: Map<number, RawCharacteristics>,
    file: unknown,
  ): void {
    for (const entry of this.arrayProperty(file, 'lineUps')) {
      const id = this.property(entry, 'id');
      const move = this.numberProperty(entry, 'ma');
      if (typeof id !== 'number' || move === null) {
        continue;
      }
      const totalStarPlayerPoints =
        this.numberProperty(entry, 'totalStarPlayerPoints') ?? 0;
      const existing = characteristics.get(id);
      if (
        existing !== undefined &&
        existing.totalStarPlayerPoints >= totalStarPlayerPoints
      ) {
        continue;
      }
      characteristics.set(id, {
        totalStarPlayerPoints,
        move,
        strength: this.numberProperty(entry, 'st'),
        agility: this.numberProperty(entry, 'ag'),
        // A raw pa of 0 is a real "structurally cannot pass" value (every
        // rules set TP covers has a Passing characteristic), not an absence
        // marker, so it is passed through unchanged like the other four.
        passing: this.numberProperty(entry, 'pa'),
        armour: this.numberProperty(entry, 'av'),
        nigglingInjuries: this.numberProperty(entry, 'nigglingInjuries'),
        canPlayNextGame: this.booleanProperty(entry, 'canPlayNextGame'),
        templateMove: this.numberProperty(
          this.property(entry, 'lineUpMaster'),
          'ma',
        ),
        templateStrength: this.numberProperty(
          this.property(entry, 'lineUpMaster'),
          'st',
        ),
        templateAgility: this.numberProperty(
          this.property(entry, 'lineUpMaster'),
          'ag',
        ),
        templatePassing: this.numberProperty(
          this.property(entry, 'lineUpMaster'),
          'pa',
        ),
        templateArmour: this.numberProperty(
          this.property(entry, 'lineUpMaster'),
          'av',
        ),
        templateKeywordCodes: this.templateKeywordCodes(
          this.property(entry, 'lineUpMaster'),
        ),
        templatePositionTypes: this.numberProperty(
          this.property(entry, 'lineUpMaster'),
          'positionTypes',
        ),
        templateIsBigGuy: this.templateIsBigGuy(
          this.property(entry, 'lineUpMaster'),
        ),
      });
    }
  }

  /**
   * One template's keyword codes: its `race` array (species codes) in TP's own
   * order, then the set bits of `positionTypes` ascending (positional codes,
   * where the bit value IS the curated code), then `BIG_GUY_KEYWORD_CODE` when
   * `isBigGuy` is set AND the template also carries a non-empty `race` or at
   * least one `positionTypes` bit. `isBigGuy` is not actually BB2025-only —
   * BB2020/DB2021 templates carry it with neither `race` nor `positionTypes`
   * — and keywords are a BB2025-only concept, so an ungated Big Guy would
   * wrongly decode a keyword for an earlier rules set. Deduplicated, first
   * occurrence winning. Null when the template carries none of the three
   * fields at all, which is how "TP publishes nothing here" is reported to
   * the panel (distinct from carrying `isBigGuy` alone, ungated, which
   * reports as `[]`).
   *
   * Decoded here rather than reused from packages/parse-tp: that parser's
   * reading of these files is the code under review, and a bug in it must not
   * agree with itself against the raw display.
   */
  private templateKeywordCodes(master: unknown): number[] | null {
    const species = this.numberArrayProperty(master, 'race');
    const mask = this.numberProperty(master, 'positionTypes');
    const isBigGuy = this.booleanProperty(master, 'isBigGuy') === true;
    if (species === null && mask === null && !isBigGuy) {
      return null;
    }
    const positionalCodes = POSITION_TYPE_CODES.filter(
      (code) => ((mask ?? 0) & code) !== 0,
    );
    const hasBb2025KeywordSpace =
      (species?.length ?? 0) > 0 || positionalCodes.length > 0;
    return [
      ...new Set([
        ...(species ?? []),
        ...positionalCodes,
        ...(isBigGuy && hasBb2025KeywordSpace ? [BIG_GUY_KEYWORD_CODE] : []),
      ]),
    ];
  }

  /**
   * The template's raw `isBigGuy` flag: false for a template that carries at
   * least one of the other two keyword fields but no flag of its own, and
   * null when the template carries none of the three -- the same overall
   * absence `templateKeywordCodes` reports.
   */
  private templateIsBigGuy(master: unknown): boolean | null {
    const species = this.numberArrayProperty(master, 'race');
    const mask = this.numberProperty(master, 'positionTypes');
    const isBigGuy = this.booleanProperty(master, 'isBigGuy') === true;
    if (species === null && mask === null && !isBigGuy) {
      return null;
    }
    return isBigGuy;
  }

  private numberProperty(value: unknown, key: string): number | null {
    const property = this.property(value, key);
    return typeof property === 'number' ? property : null;
  }

  /**
   * A key's array-of-numbers value: `null` when the key is absent, `[]` when
   * present but not an array of numbers (a malformed value degrades to
   * "no codes" rather than failing the run), and otherwise the numbers
   * themselves, non-numeric entries dropped.
   */
  private numberArrayProperty(value: unknown, key: string): number[] | null {
    const property = this.property(value, key);
    if (property === undefined) {
      return null;
    }
    if (!Array.isArray(property)) {
      return [];
    }
    return property.filter(
      (entry): entry is number => typeof entry === 'number',
    );
  }

  private booleanProperty(value: unknown, key: string): boolean | null {
    const property = this.property(value, key);
    return typeof property === 'boolean' ? property : null;
  }

  private lineUpsOf(file: unknown, key: string): unknown[] {
    const roster = this.property(this.property(file, key), 'roster');
    return this.arrayProperty(roster, 'lineUps');
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

  /**
   * Directory entries, or none when the directory is absent — sorted by name
   * so the scan order (and, with it, which of two equal-`totalStarPlayerPoints`
   * roster snapshots for the same line-up id wins a tie) is reproducible
   * across platforms and runs, rather than whatever order the filesystem
   * happens to return. `readdir` itself makes no ordering guarantee.
   */
  private async entries(dir: string): Promise<Dirent[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
